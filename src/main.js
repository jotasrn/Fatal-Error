// Game bootstrap: solo waves, free-for-all lobbies, checkpoints, scoring, screens and the loop.
// Online play is peer-to-peer: one player's browser hosts the lobby and keeps score, every
// player runs their own body, and each one tells the others what it did.
import * as THREE from 'three';
import { InkRenderer, INK, makeInkMaterial } from './render.js';
import { World } from './physics.js';
import { Input } from './input.js';
import { buildLevel, LEVELS } from './levels/index.js';
import { NavGrid } from './nav.js';
import { Effects } from './effects.js';
import { EnemyManager, BOSSES } from './enemies/index.js';
import { Player } from './player/index.js';
import { RemotePlayer, encodeLocal } from './players.js';
import { Net } from './net.js';
import { HUD, CONTROLS_HTML } from './hud.js';
import { audio } from './audio.js';
import { rand, choose, clamp } from './util.js';
import { createSurvival } from './game/survival.js';

const canvas = document.getElementById('c');
const R = new InkRenderer(canvas);
const world = new World();
const knownMap = (k) => (LEVELS.some((m) => m.key === k) ? k : 'district');
let mapKey = knownMap(localStorage.getItem('doodle_map') || 'district');
let level = buildLevel(R.scene, world, mapKey, { arena: false });
let nav = new NavGrid(world, level.bounds, 1).build();
let loadedKey = mapKey, arenaLoaded = false;
audio.setTune(mapKey === 'mexico' ? 'mexico' : 'district');
// the map in play: solo uses the picked map, a match uses the host's choice; a rebuild wipes broken props
function setLevel(key, on, force = false) {
  if (!force && key === loadedKey && on === arenaLoaded) return; loadedKey = key; arenaLoaded = on;
  for (const m of level.meshes) { R.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.traverse) m.traverse((o) => { if (o !== m && o.geometry) o.geometry.dispose(); }); }
  level.animated.length = 0; world.clear();
  level = buildLevel(R.scene, world, key, { arena: on }); nav = new NavGrid(world, level.bounds, 1).build();
  ctx.level = level; ctx.nav = nav; if (window.__game) { window.__game.level = level; window.__game.nav = nav; }
  audio.setTune(key === 'mexico' ? 'mexico' : 'district');
}
const setArena = (on) => setLevel(knownMap(net.active ? (lobby.map || mapKey) : mapKey), on);
const input = new Input(canvas);
const hud = new HUD(document.getElementById('hud'));
const effects = new Effects(R.scene, world);
const ctx = { scene: R.scene, camera: R.camera, world, level, nav, input, hud, effects, audio, renderer: R };

// ---------------- persistent bits ----------------
let best = Number(localStorage.getItem('doodle_best') || 0);
let musicWanted = localStorage.getItem('doodle_music') !== '0';
let checkpoint = Number(localStorage.getItem('doodle_checkpoint') || 0);
// online bank: cash you carry between online matches (solo keeps its own roguelike economy)
let bank = Number(localStorage.getItem('doodle_bank') || 300); let bankSaveT = 0;
const saveBank = () => { bank = Math.max(0, Math.round(player.money)); localStorage.setItem('doodle_bank', String(bank)); };
let myName = (localStorage.getItem('doodle_name') || '').slice(0, 14) || 'Doodle' + Math.floor(Math.random() * 90 + 10);
const settings = { sens: Number(localStorage.getItem('doodle_sens') || 100), invert: localStorage.getItem('doodle_invert') === '1' };

const hudPrefs = {
  chColor: localStorage.getItem('doodle_ch_color') || '#d02030',
  chSize: Number(localStorage.getItem('doodle_ch_size') || '1'),
  chDot: localStorage.getItem('doodle_ch_dot') !== '0',
  scale: Number(localStorage.getItem('doodle_hud_scale') || '100'),
  opacity: Number(localStorage.getItem('doodle_hud_opacity') || '100'),
  killfeed: localStorage.getItem('doodle_hud_kf') !== '0',
  damageNums: localStorage.getItem('doodle_hud_dmg') !== '0',
};

function applyHudSettings() {
  document.documentElement.style.setProperty('--ch-color', hudPrefs.chColor);
  document.documentElement.style.setProperty('--ch-scale', String(hudPrefs.chSize));
  
  const ch = document.getElementById('crosshair');
  if (ch) ch.style.transform = `scale(${hudPrefs.chSize})`;
  
  const dot = document.querySelector('.ch-dot');
  if (dot) dot.style.display = hudPrefs.chDot ? 'block' : 'none';

  const hudEl = document.getElementById('hud');
  if (hudEl) {
    hudEl.style.opacity = (hudPrefs.opacity / 100).toFixed(2);
  }
  const kf = document.querySelector('.killfeed');
  if (kf) kf.style.display = hudPrefs.killfeed ? 'block' : 'none';
  const dmg = document.querySelector('.dmg-ind');
  if (dmg) dmg.style.display = hudPrefs.damageNums ? 'block' : 'none';

  localStorage.setItem('doodle_ch_color', hudPrefs.chColor);
  localStorage.setItem('doodle_ch_size', String(hudPrefs.chSize));
  localStorage.setItem('doodle_ch_dot', hudPrefs.chDot ? '1' : '0');
  localStorage.setItem('doodle_hud_scale', String(hudPrefs.scale));
  localStorage.setItem('doodle_hud_opacity', String(hudPrefs.opacity));
  localStorage.setItem('doodle_hud_kf', hudPrefs.killfeed ? '1' : '0');
  localStorage.setItem('doodle_hud_dmg', hudPrefs.damageNums ? '1' : '0');
}

function applySettings() {
  input.mouseSens = 0.0022 * settings.sens / 100; input.padSensX = 3.4 * settings.sens / 100; input.padSensY = 2.6 * settings.sens / 100; input.invertY = settings.invert;
  localStorage.setItem('doodle_sens', String(settings.sens)); localStorage.setItem('doodle_invert', settings.invert ? '1' : '0');
  applyHudSettings();
}
// ---------------- game state ----------------
const FFA_TARGET = 20, FFA_TIME = 600, RESPAWN = 2.5;
let matchLeft = FFA_TIME, clockT = 0, clockRunning = false;
const mmss = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const game = ctx.game = {
  state: 'start', mode: 'solo', menu: false, time: 0, hitstopT: 0, hitstopScale: 1, wave: 0, score: 0, combo: 0, comboT: 0, kills: 0, intermission: 0, queue: [], spawnT: 0, maxAlive: 6, deathT: 0,
  focus: { active: false, t: 0, chain: 0, target: null, dash: null, arm: 0, ready: false }, katanaStreak: 0, boss: null, respawnT: 0, matchT: 0, over: null, overT: 0,
  hitstop(d, s) { this.hitstopT = Math.max(this.hitstopT, d); this.hitstopScale = s; },
  addScore(pts, label) { const mult = 1 + Math.min(this.combo, 9) * 0.25; const p = Math.round(pts * mult); this.score += p; if (label) hud.kill(label, p); hud.setScore(this.score, this.combo); },
  onPlayerDeath() { endFocus(); onLocalDeath(); },
};
const online = () => game.mode === 'ffa';
const enemies = ctx.enemies = new EnemyManager(ctx);
const player = ctx.player = new Player(ctx);
hud.onBuy = (itemKey) => {
  player.buyItem(itemKey);
  hud.toggleBuyMenu(true, player);
};
hud.setMoney(player.money);
hud.setArmor(player.armor, player.maxArmor);
player.name = myName;
const net = new Net();
const remote = new Map();      // peer id -> RemotePlayer
const lobby = { players: new Map(), hostId: null, isPublic: true, status: '', code: '', map: null };
const scores = new Map();      // peer id -> { name, kills, deaths }
let screen = 'main';           // which start-screen panel is showing: main | online | lobby
window.__game = { ctx, game, player, enemies, nav, world, level, hud, effects, input, net, remote, lobby, scores };

// Solo survival systems (waves, pickups, katana focus) live in their own module; it reads live
// state through ctx (ctx.level is kept current by setLevel) and reports back through these.
const survival = createSurvival(ctx, {
  net, online,
  getCheckpoint: () => checkpoint,
  setCheckpoint: (v) => { checkpoint = v; localStorage.setItem('doodle_checkpoint', String(v)); },
});
ctx.survival = survival;
const {
  pickups, spawnPickup, removePickup, updatePickups, updateArenaPickups,
  startWave, updateWaves, pickSpawn,
  focusCandidate, enterFocus, endFocus, updateFocus,
  FOCUS_SCALE, KATANA_CHARGE_KILLS,
} = survival;

// anything a bullet or a blade can hit besides enemies
ctx.targets = () => [player, ...remote.values()];
ctx.canHurt = (t) => online() && t !== player;
ctx.raycastPlayers = (o, d, maxDist) => {
  let best = null;
  for (const t of remote.values()) {
    if (!t.alive || !ctx.canHurt(t)) continue;
    for (let i = 0; i < t.hit.length; i++) {
      const c = t.hitSpheres[i], r = t.hit[i][1];
      _v.subVectors(c, o); const tca = _v.dot(d); if (tca < 0 || tca > maxDist) continue;
      const d2 = _v.lengthSq() - tca * tca; if (d2 > r * r) continue;
      const tt = tca - Math.sqrt(r * r - d2); if (tt < 0) continue;
      if (!best || tt < best.dist) best = { player: t, part: t.hit[i][0], dist: tt, point: new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt) };
    }
    // a raised katana sits in front of the chest: a ray that reaches it before the body is turned aside
    if (t.blocking) {
      _bc.set(t.center.x + t.forward.x * 0.5, t.center.y + 0.3, t.center.z + t.forward.z * 0.5); const r = 0.42;
      _v.subVectors(_bc, o); const tca = _v.dot(d);
      if (tca > 0 && tca <= maxDist) { const d2 = _v.lengthSq() - tca * tca; if (d2 <= r * r) { const tt = tca - Math.sqrt(r * r - d2); if (tt >= 0 && (!best || best.player !== t || tt < best.dist)) best = { player: t, part: 'blade', dist: tt, point: new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt) }; } }
    }
  }
  return best;
};
const _bc = new THREE.Vector3();
ctx.playersInArc = (pos, dir, range, cosHalf) => { const out = []; for (const t of remote.values()) { if (!t.alive || !ctx.canHurt(t)) continue; _v.subVectors(t.center, pos); const d = _v.length(); if (d > range + 0.3) continue; if (d > 0.3 && _v.normalize().dot(dir) < cosHalf) continue; if (!world.hasLineOfSight(pos, t.center)) continue; out.push(t); } return out; };
ctx.hitPlayer = (t, dmg, info) => {
  if (!ctx.canHurt(t) || !t.alive) return;
  // a raised katana facing you parries a slash outright and turns some bullets aside
  // the bullet met the blade itself: it glances off, and now and then comes straight back at you
  if (info.part === 'blade') {
    effects.strokeBurst(info.point, INK.ORANGE, 8, 6, { life: 0.22, size: 0.035 }); audio.shieldHit(t.center);
    const ret = Math.random() < 0.4;
    if (ret) {
      effects.tracer(info.point, player.eye, INK.RED, 0.03, 0.08); hud.tip('Rebatido', 0.9); input.rumble(0.5, 0.4, 90);
      player.lastHitBy = t.id; player.lastHit = { from: t.center.toArray(), crit: false, amount: dmg * 0.6, src: 'deflect' }; player.takeDamage(dmg * 0.6, t.center);
    } else hud.tip('Desviado', 0.7);
    net.sendTo(t.id, 'parry', { ret, by: net.id });
    return;
  }
  const facing = t.blocking ? _v.subVectors(player.center, t.center).normalize().dot(t.forward) : -1;
  const frontHit = /^(head|torso|arm|fore)/.test(info.part || '');
  // a slash is only parried by a guard that just came up and faces you
  if (facing > 0.6 && frontHit && info.source === 'katana' && t.parryWindow) { effects.strokeBurst(info.point, INK.ORANGE, 10, 6, { life: 0.25, size: 0.04 }); audio.shieldHit(t.center); game.hitstop(0.08, 0.15); player.weapons[player.katanaIndex].cooldown = Math.max(player.weapons[player.katanaIndex].cooldown, 0.6); input.rumble(0.6, 0.3, 90); hud.tip('Bloqueado', 0.9); return; }
  effects.blood(info.point, info.dir, clamp(0.4 + dmg / 80, 0.4, 1.6), { ink: INK.RED }); hud.hitmarker(false, info.crit); audio.hitEnemy(t.center); t.flash();
  net.sendTo(t.id, 'pdmg', { amount: Math.round(dmg), from: player.center.toArray().map((v) => +v.toFixed(1)), by: net.id, crit: !!info.crit, src: info.source });
};
// a slash through another player's rope cuts it: their client drops the hook
const _rp = new THREE.Vector3(), _rq = new THREE.Vector3();
ctx.cutRopes = (eye, dir, range) => {
  let cut = false;
  for (const r of remote.values()) {
    if (!r.alive || !r.grappling) continue;
    _rp.set(r.body.pos.x + r.right.x * 0.35, r.body.pos.y + 1.25, r.body.pos.z + r.right.z * 0.35);
    for (let i = 0; i <= 14; i++) {
      _rq.lerpVectors(_rp, r.gPoint, i / 14).sub(eye); const t = _rq.dot(dir); if (t < 0.3 || t > range) continue;
      const lat = Math.sqrt(Math.max(0, _rq.lengthSq() - t * t)); if (lat > 0.9) continue;
      _rq.add(eye); effects.strokeBurst(_rq, INK.ORANGE, 10, 5, { life: 0.25, size: 0.035 }); net.sendTo(r.id, 'cut', {}); hud.tip('Corda cortada', 0.9); cut = true; break;
    }
  }
  return cut;
};
const _v = new THREE.Vector3();
// breakable props: bullets, blades and blasts break them, and everyone in a match sees it go
ctx.breakHit = (br, dmg, point, dir) => {
  if (!br.alive) return; br.hp -= dmg;
  if (br.hp <= 0) breakProp(br, dir, true); else { effects.strokeBurst(point, br.ink, 5, 4, { life: 0.2, size: 0.03 }); audio.shieldHit(point); }
};
ctx.breakablesInArc = (pos, dir, range, cosHalf) => level.breakables.filter((br) => { if (!br.alive) return false; _v.subVectors(br.pos, pos); const d = _v.length(); return d < range + 0.5 && (d < 0.4 || _v.divideScalar(d).dot(dir) > cosHalf); });
ctx.blastBreakables = (c, R) => { for (const br of level.breakables) if (br.alive && br.pos.distanceTo(c) < R * 0.9) breakProp(br, br.pos.clone().sub(c).normalize(), true); };
function breakProp(br, dir, local, quiet = false) {
  if (!br.alive) return; br.alive = false; world.removeBox(br.box);
  const g = br.group, pos = br.pos; const d = dir && dir.lengthSq() > 0.01 ? dir.clone().normalize() : new THREE.Vector3(rand(-1, 1), 1, rand(-1, 1)).normalize();
  if (quiet) { R.scene.remove(g); return; }
  g.updateMatrixWorld(true);
  for (const child of [...g.children]) {
    child.updateWorldMatrix(true, false); R.scene.attach(child);
    const v = d.clone().multiplyScalar(rand(2, 6)); v.x += rand(-3, 3); v.z += rand(-3, 3); v.y += rand(2.5, 6.5);
    effects.debris(child, child.position, v, new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), { radius: 0.14, blood: false, life: rand(6, 9) });
  }
  R.scene.remove(g);
  const up = new THREE.Vector3(0, 1, 0);
  if (br.kind === 'pinata') {
    for (const ink of [INK.PINK, INK.ORANGE, INK.GREEN]) effects.strokeBurst(pos, ink, 16, 7, { life: 0.7, size: 0.05 });
    effects.explosion(pos, 2.5, INK.PINK); if (!net.active || net.isHost) for (let i = 0; i < 2; i++) spawnPickup('health', pos.clone().add(new THREE.Vector3(rand(-1.2, 1.2), 0, rand(-1.2, 1.2))));
    if (game.mode === 'solo') game.addScore(25, 'Piñata');
  } else if (br.kind === 'cactus') { effects.blood(pos, d, 1.4, { ink: INK.GREEN }); effects.bloodPool(new THREE.Vector3(pos.x, 0, pos.z), 1.1, INK.GREEN); }
  else { effects.strokeBurst(pos, br.ink, 12, 5, { life: 0.35, size: 0.04 }); effects.smoke(pos, up, 3); }
  audio.smash(pos, br.kind === 'barrel' || br.kind === 'crate' || br.kind === 'cactus');
  if (local && net.active) net.broadcast('brk', { id: br.id });
}
// every ray a gun fires this tick is sent to the others, who draw it as a tracer from the shooter's gun
const shotQueue = [];
ctx.onShot = (end) => { if (net.active && inMatch()) shotQueue.push(+end.x.toFixed(1), +end.y.toFixed(1), +end.z.toFixed(1)); };
const TRACER_THICK = { rifle: 0.02, smg: 0.016, shotgun: 0.014, sniper: 0.03, laser: 0.038 };
const _sm = new THREE.Vector3(), _se = new THREE.Vector3();


enemies.onSpawn = (e) => {
  if (net.active && net.isHost) {
    net.send('espawn', { id: e.id, type: e.type, pos: e.body.pos.toArray() });
  }
};
enemies.onClientHit = (e, amount, info) => {
  if (net.active && !net.isHost) {
    net.send('ehit', {
      id: e.id,
      amount,
      info: {
        crit: !!info.crit,
        part: info.part,
        point: info.point ? info.point.toArray().map(v => +v.toFixed(2)) : null,
        dir: info.dir ? info.dir.toArray().map(v => +v.toFixed(2)) : null
      }
    });
  }
};
enemies.onKill = (e, info, over) => {
  if (net.active && net.isHost) {
    net.send('ekill', {
      id: e.id,
      info: {
        crit: !!info.crit,
        dir: info.dir ? info.dir.toArray().map(v => +v.toFixed(2)) : null,
        point: info.point ? info.point.toArray().map(v => +v.toFixed(2)) : null
      }
    });
  }
  game.kills++; game.combo++; game.comboT = 3.5;
  let label = e.T.name, pts = e.T.score;
  if (info.crit) { label = 'Tiro na Cabeça'; pts += 60; }
  if (info.source === 'katana') { label = over ? 'Cortado ao Meio' : 'Fatiado'; pts += 50; }
  if (info.source === 'focus') { label = 'Execução'; pts += 150; }
  if (info.source === 'katana' || info.source === 'focus') { game.katanaStreak++; player.weapons[player.katanaIndex].addBlood(0.42); if (game.katanaStreak >= KATANA_CHARGE_KILLS) enterFocus(); }
  else if (info.source !== 'blast') game.katanaStreak = 0;
  if (info.source === 'deflect') { label = 'Rebatido'; pts += 120; }
  if (info.source === 'fall') label = 'Caiu da Página';
  else if (!player.body.onGround && info.source !== 'deflect') { label += ' · Abate Aéreo'; pts += 40; }
  game.addScore(pts, label); audio.kill(!!info.crit || e.T.boss);
  let cash = 75;
  if (info.crit) cash += 75;
  if (info.source === 'katana' || info.source === 'focus') cash += 100;
  if (e.T.boss) cash += 325;
  player.addCash(cash, label);
  const r = Math.random(); if (r < 0.5) spawnPickup('ammo', e.body.pos); else if (r < 0.62) spawnPickup('health', e.body.pos);
};
let brasiliaEventTimer = 0;
function triggerBrasiliaManifestation() {
  if (level.key !== 'brasilia') return;
  ctx.protestersRiot = false;
  ctx.playerWanted = false;

  const existingAmbient = enemies.enemies.filter(e => e.alive && (e.T.isProtester || e.T.isPolice || e.T.isCivilian)).length;
  if (existingAmbient > 8) return; // Evita acúmulo excessivo de bots

  // Manifestantes com bandeiras do PT
  const protSpots = [
    new THREE.Vector3(-4, 0, 10), new THREE.Vector3(4, 0, 12),
    new THREE.Vector3(-6, 0, 22), new THREE.Vector3(0, 0, 24), new THREE.Vector3(5, 0, 26),
    new THREE.Vector3(-3, 0, 36), new THREE.Vector3(3, 0, 38)
  ];
  for (const pos of protSpots) {
    const p = enemies.spawn('protester', pos);
    p.state = 'hunt';
  }

  // Pelotão da PMDF / Choque
  const polSpots = [
    new THREE.Vector3(-6, 0, 68), new THREE.Vector3(0, 0, 68), new THREE.Vector3(6, 0, 68)
  ];
  for (const pos of polSpots) {
    const pol = enemies.spawn('police', pos);
    pol.state = 'hunt';
  }
  const chief = enemies.spawn('police_chief', new THREE.Vector3(0, 0, 72));
  chief.state = 'hunt';

  audio.siren(new THREE.Vector3(0, 0, 60));
  if (hud) {
    hud.message('🚩 MANIFESTAÇÃO NA ESPLANADA!', 'Guerra entre Manifestantes e PMDF! Não interfira ou sofrerá as consequências!', 5.0);
  }
}

function spawnBrasiliaCivilians() {
  const civSpots = [
    new THREE.Vector3(0, 7, -213),      // Plataforma superior da Rodoviária
    new THREE.Vector3(-30, 7, -210),    // Mezanino da Rodoviária
    new THREE.Vector3(-10, 0, -188),    // Saída da Rodoviária
    new THREE.Vector3(46, 0, -140),     // Calçada do Museu Nacional
    new THREE.Vector3(44, 0, -100),     // Entrada da Catedral
    new THREE.Vector3(-46, 0, -128),    // Teatro Nacional
    new THREE.Vector3(0, 0.22, -60),    // Gramado Central da Esplanada
    new THREE.Vector3(-41, 0, -10),     // Parada de ônibus Norte
    new THREE.Vector3(41, 0, 46),       // Calçada Ministério Sul
    new THREE.Vector3(6, 0.22, 110),    // Frente do Congresso
  ];
  for (const pos of civSpots) {
    const c = enemies.spawn('civilian', pos);
    c.state = 'hunt';
  }
  triggerBrasiliaManifestation();
}

ctx.onCivilianKilled = (civ, info) => {
  audio.siren(civ.center);
  hud.message('🚨 CRIME COMETIDO!', 'A Polícia foi acionada para conter o infrator!', 3.5);
  hud.kill('🚨 Inocente Morto · Polícia Acionada!', -100);
  player.addCash(-150, 'Crime / Multa Policial');
  game.addScore(-100, 'Crime Cometido');

  if (!online() || net.isHost) {
    const cx = civ.body.pos.x, cz = civ.body.pos.z;
    for (let i = 0; i < 2; i++) {
      const pPos = new THREE.Vector3(cx + (i === 0 ? -6 : 6), 0, cz + (Math.random() - 0.5) * 8);
      const pBot = enemies.spawn('police', pPos);
      pBot.state = 'hunt';
      pBot.target = player;
    }
    const chiefPos = new THREE.Vector3(cx, 0, cz + (cz > 0 ? -10 : 10));
    const chief = enemies.spawn('police_chief', chiefPos);
    chief.state = 'hunt';
    chief.target = player;
  }
};

enemies.onBoss = (e) => { if (!e.alive) { hud.setBoss(null, null); game.boss = null; } else { game.boss = e; hud.setBoss(e.T.name, e.hp / e.maxHp); } };
player.onThrow = (d) => { if (net.active) net.broadcast('nade', d); };
player.onRocket = (d) => { if (net.active) net.broadcast('rocket', d); };


// ---------------- free for all: spawning, death, scoring ----------------
const HOW = { rifle: 'Rifle', smg: 'Submetralhadora', laser: 'Fuzil de Plasma', shotgun: 'Escopeta', sniper: 'Sniper', bazooka: 'Bazuca', katana: 'Katana', grenade: 'Granada', deflect: 'próprio tiro', blast: 'explosão' };
const howWord = (src) => HOW[src] || null;
const spawnSpots = () => (level.arenaSpawns && level.arenaSpawns.length ? level.arenaSpawns : level.spawns);
function arenaSpawn() {
  const spots = spawnSpots(); const others = [...remote.values()].filter((r) => r.alive && r.root && r.root.visible);
  const scored = spots.map((s) => ({ s, d: others.reduce((a, r) => Math.min(a, r.body.pos.distanceTo(s)), 999) }));
  scored.sort((a, b) => b.d - a.d);
  return choose(scored.slice(0, Math.min(3, scored.length))).s.clone();
}
// a spot for a late joiner: the one farthest from everybody already in the match
function farthestSpawnIndex() {
  const spots = spawnSpots(); const bodies = [player, ...remote.values()].filter((r) => r.alive); let best = 0, bd = -1;
  spots.forEach((s, i) => { const d = bodies.reduce((a, r) => Math.min(a, r.body.pos.distanceTo(s)), 999); if (d > bd) { bd = d; best = i; } });
  return best;
}
function onLocalDeath() {
  if (!online()) { game.state = 'dying'; game.deathT = 0; return; }
  const killer = player.lastHitBy || null; const h = player.lastHit || {};
  const dir = h.from ? player.center.clone().sub(new THREE.Vector3().fromArray(h.from)).normalize().toArray().map((v) => +v.toFixed(2)) : null;
  const how = killer ? howWord(h.src) : null;
  net.broadcast('pdead', { killer, dir, over: !!(h.crit || h.amount >= 90 || h.src === 'katana'), how, crit: !!h.crit });
  if (net.isHost) tallyDeath(net.id, killer);
  game.respawnT = RESPAWN; game.state = 'dying'; game.deathT = 0;
  const kn = killer && scores.get(killer) ? scores.get(killer).name : null;
  hud.kill(kn ? 'Eliminado por ' + kn + (how ? ' · ' + how + (h.crit ? ' Tiro na Cabeça' : '') : '') : 'Eliminado', 0);
}
function respawnLocal() {
  player.reset(arenaSpawn()); player.name = myName; player.lastHitBy = null; player.lastHit = null; game.state = 'play'; player.shieldT = 2; hud.tip('Escudo de Renascimento · 2s', 1.6);
  effects.strokeBurst(player.center, INK.BLUE, 24, 6, { life: 0.5, size: 0.03 }); audio.spawn(player.center);
}
function tallyDeath(victim, killer) {
  const v = scores.get(victim); if (v) v.deaths++;
  if (killer && killer !== victim) { const k = scores.get(killer); if (k) k.kills++; }
  sendScores(); checkWin();
}
function sendScores() { const rows = [...scores.entries()].map(([id, s]) => ({ id, ...s })); net.send('score', rows); applyScores(rows); }
function applyScores(rows) { scores.clear(); for (const r of rows) scores.set(r.id, { name: r.name, kills: r.kills, deaths: r.deaths }); refreshScoreHud(); }
function sortedScores() { return [...scores.entries()].sort((a, b) => b[1].kills - a[1].kills || a[1].deaths - b[1].deaths); }
function refreshScoreHud() {
  if (!online()) return;
  const rows = sortedScores(); const top = rows.slice(0, 3); const myIdx = rows.findIndex(([id]) => id === net.id);
  if (myIdx >= 3) top.push(rows[myIdx]);
  hud.setPvpScore(top.map(([id, sc]) => `<div class="row${id === net.id ? ' me' : ''}"><span class="rank">${rows.findIndex(([x]) => x === id) + 1}.</span><span>${esc(sc.name)}${id === net.id ? ' (Você)' : ''}</span><b>${sc.kills}</b></div>`).join('') + `<div class="target">Primeiro a ${FFA_TARGET} kills</div>`);
  hud.setModifier('');
  if (!hud.el.board.hidden) hud.setBoard(boardHTML());
}
function boardHTML(title = 'Mata-Mata Livre') {
  const rows = sortedScores();
  return `<h3>${title}</h3>${rows.map(([id, s]) => `<div class="${id === net.id ? 'me' : ''}"><span>${s.name}${id === net.id ? ' (Você)' : ''}</span><span>${s.kills} Kills · ${s.deaths} Mortes</span></div>`).join('')}<div class="foot">Primeiro a ${FFA_TARGET} kills · Restam ${mmss(matchLeft)} · Sala ${String(net.aliasCode || net.code || '').replace(/-\d+$/, '')}</div>`;
}
function checkWin() {
  if (!net.isHost || !online() || game.over) return;
  let winner = null;
  for (const [id, s] of scores) if (s.kills >= FFA_TARGET) winner = { id, name: s.name };
  if (winner) { net.send('end', winner); endMatch(winner); }
}
function endMatch(winner) {
  game.over = winner; game.overT = 0; game.state = 'over'; endFocus(); input.exitLock(); hud.setBoard(null);
  const title = winner.id === net.id ? 'Você Venceu!' : (winner.name || 'Alguém') + ' Venceu!';
  hud.setGameplayVisible(false); hud.showScreen(`<h1>${title}</h1><div class="scoreboard">${sortedScores().map(([id, s]) => `<div class="${id === net.id ? 'me' : ''}"><span>${s.name}</span><span>${s.kills} Kills · ${s.deaths} Mortes</span></div>`).join('')}</div><div class="go" id="overGo">Retornando à sala em breve…</div>`);
}

// ---------------- networking ----------------
function addRemote(id, name) {
  if (remote.has(id)) { const r = remote.get(id); r.name = name; return r; }
  const rp = new RemotePlayer(ctx, id, name, 0, INK.PURPLE); // players are violet; bots never use it
  rp.onDamage = (t, amount, fromPos) => { if (!ctx.canHurt(t) || !t.alive) return; hud.hitmarker(false, false); net.sendTo(t.id, 'pdmg', { amount: Math.round(amount), from: fromPos ? fromPos.toArray().map((v) => +v.toFixed(1)) : null, by: net.id, src: 'grenade' }); };
  remote.set(id, rp); return rp;
}
function removeRemote(id) { const r = remote.get(id); if (r) { r.dispose(); remote.delete(id); } lobby.players.delete(id); scores.delete(id); }
function lobbyRows() { return [...lobby.players.entries()].map(([id, p]) => ({ id, name: p.name })); }
function broadcastLobby() { net.send('lobby', { players: lobbyRows(), hostId: net.id, isPublic: lobby.isPublic, map: lobby.map || mapKey, shown: net.aliasCode || net.code }); renderLobby(); }
const inMatch = () => ['play', 'dying', 'over'].includes(game.state);
net.onPeerLeave = (id) => { const nm = (lobby.players.get(id) || {}).name; removeRemote(id); broadcastLobby(); if (inMatch()) { hud.kill((nm || 'Alguém') + ' saiu da sala', 0); sendScores(); } };
net.onDisconnect = () => { if (lobby.order && lobby.order.some((id) => id !== lobby.hostId)) migrateHost(); else leaveOnline('O anfitrião saiu da sala'); };
// ---- host transfer: when the host goes, the earliest-joined player left takes over on a generation
// code (the old code is slow to free up on the signalling server); everyone else rejoins there
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let migrating = false;
async function migrateHost() { if (migrating) return; migrating = true; try { await _migrateHost(); } finally { migrating = false; } }
async function _migrateHost() {
  const oldHost = lobby.hostId, myId = net.id; const gen = (lobby.gen || 0) + 1; lobby.gen = gen;
  const base = (lobby.code || net.code || '').replace(/-\d+$/, ''); const code = base + '-' + gen;
  const roster = (lobby.order || []).filter((id) => id !== oldHost && lobby.players.has(id)); if (!roster.length || !base) { leaveOnline('O anfitrião saiu da sala'); return; }
  const successor = roster[0]; const wasInMatch = inMatch();
  if (oldHost) { const r = remote.get(oldHost); if (r) r.dispose(); remote.delete(oldHost); lobby.players.delete(oldHost); scores.delete(oldHost); }
  hud.message('O anfitrião saiu', successor === myId ? 'Você é o novo anfitrião' : 'Migrando para novo anfitrião…', 2.6);
  if (successor === myId) {
    let ok = false;
    for (let tries = 0; tries < 2 && !ok; tries++) { try { await net.host({ isPublic: lobby.isPublic, code }); ok = true; } catch (e) { await sleep(800); } }
    if (!ok) { leaveOnline('Não foi possível assumir a sala'); return; }
    const mine = lobby.players.get(myId) || { name: myName }; lobby.players.delete(myId); lobby.players.set(net.id, mine);
    const ms = scores.get(myId); scores.delete(myId); if (ms) scores.set(net.id, ms);
    lobby.hostId = net.id; lobby.code = code; lobby.order = [net.id, ...roster.filter((id) => id !== myId)]; net.accepting = true; game.clockStarted = clockRunning || matchLeft < FFA_TIME;
    net.onAlias = () => { broadcastLobby(); hud.kill('Código da sala ' + base + ' restaurado', 0); }; net.claimAlias(base);
    if (game.state === 'over') { /* the results stay up; the host timer now runs here */ } else if (wasInMatch) { if (game.state !== 'play' && game.state !== 'dying') game.state = 'play'; refreshScoreHud(); } else { game.state = 'lobby'; screen = 'lobby'; showStart(); }
    broadcastLobby();
  } else {
    await sleep(1200);
    const deadline = performance.now() + 20000; let joined = false;
    while (!joined && performance.now() < deadline) { try { await net.join(code, { name: myName, prev: myId }); joined = true; } catch (e) { await sleep(1200); } }
    if (!joined) { leaveOnline('O anfitrião saiu, partida encerrada'); return; }
    lobby.code = code; if (!wasInMatch) { game.state = 'lobby'; screen = 'lobby'; showStart(); }
  }
}
net.on('refused', (d) => leaveOnline(d.reason));
net.hostName = myName;
net.onPeerJoin = (from, meta) => {
  const name = String(meta && meta.name || 'doodle').slice(0, 14);
  if (meta && meta.prev && meta.prev !== from) { const sc = scores.get(meta.prev); if (sc) { scores.delete(meta.prev); scores.set(from, sc); } const r = remote.get(meta.prev); if (r) r.dispose(); remote.delete(meta.prev); lobby.players.delete(meta.prev); if (lobby.order) lobby.order = lobby.order.filter((id) => id !== meta.prev); }
  lobby.players.set(from, { name }); addRemote(from, name); broadcastLobby();
  if (game.state === 'play' || game.state === 'dying') {
    if (!scores.has(from)) scores.set(from, { name, kills: 0, deaths: 0 });
    net.sendTo(from, 'start', { late: true, spawn: farthestSpawnIndex(), map: lobby.map || mapKey, broken: level.breakables.filter((b) => !b.alive).map((b) => b.id) });
    // Sincroniza imediatamente todos os bots vivos para o novo jogador:
    if (net.isHost) {
      for (const e of enemies.enemies) {
        if (e.alive) net.sendTo(from, 'espawn', { id: e.id, type: e.type, pos: e.body.pos.toArray() });
      }
    }
    sendScores();
    hud.kill(name + ' entrou na sala', 0);
  }
};
net.on('lobby', (d) => {
  lobby.hostId = d.hostId; lobby.isPublic = !!d.isPublic; lobby.code = net.code; lobby.shown = d.shown || net.code; if (d.map) lobby.map = knownMap(d.map); lobby.order = d.players.map((p) => p.id); lobby.players.clear();
  for (const p of d.players) lobby.players.set(p.id, { name: p.name });
  for (const p of d.players) if (p.id !== net.id) addRemote(p.id, p.name);
  for (const id of [...remote.keys()]) if (!lobby.players.has(id)) removeRemote(id);
  if (inMatch()) { for (const p of d.players) if (!scores.has(p.id)) scores.set(p.id, { name: p.name, kills: 0, deaths: 0 }); refreshScoreHud(); }
  renderLobby();
});
net.on('leave', (d) => { const nm = (lobby.players.get(d.id) || {}).name; removeRemote(d.id); if (inMatch()) hud.kill((nm || 'Alguém') + ' saiu da sala', 0); renderLobby(); });
net.on('start', (d) => { if (net.isHost) return; if (d.map) lobby.map = knownMap(d.map); startMatch(!!d.late, d.spawns ? d.spawns[net.id] : d.spawn); if (d.broken) for (const id of d.broken) { const br = level.breakables[id]; if (br) breakProp(br, null, false, true); } });
net.on('startreq', () => { if (net.isHost && game.state === 'lobby') hostStart(); });
net.on('end', (d) => endMatch(d));
net.on('backtolobby', () => { if (!net.isHost) toLobbyScreen(); });
net.on('pickup', (d) => { if (!net.isHost) spawnPickup(d.kind, new THREE.Vector3().fromArray(d.pos), d.id); });
net.on('taken', (d) => { const p = pickups.find((x) => x.id === d.id); if (p) removePickup(p); });
net.on('take', (d) => { if (!net.isHost) return; const p = pickups.find((x) => x.id === d.id); if (p) { removePickup(p); net.send('taken', { id: d.id }); } });
net.on('ps', (d, from) => { const r = remote.get(from); if (r) { r.push(d, performance.now() / 1000); r.lastSeen = performance.now(); } });
net.on('pdmg', (d) => {
  if (!player.alive || game.state !== 'play' || player.shieldT > 0) return; player.lastHitBy = d.by || null; player.lastHit = { from: d.from || null, crit: !!d.crit, amount: d.amount, src: d.src };
  player.takeDamage(d.amount, d.from ? new THREE.Vector3().fromArray(d.from) : null);
});
net.on('espawn', (d) => { if (!net.isHost) enemies.spawn(d.type, new THREE.Vector3().fromArray(d.pos), d.id); });
net.on('esnap', (arr) => { if (!net.isHost) enemies.applySnapshot(arr, performance.now() / 1000); });
net.on('ekill', (d) => { if (!net.isHost) enemies.killMirror(d.id, d.info); });
net.on('ekillcredit', (d) => { game.kills++; game.addScore(d.pts, d.label); player.addCash(d.cash, d.label); audio.kill(true); });
net.on('ewave', (d) => { if (!net.isHost) { game.wave = d.wave; hud.setWave(d.wave, 0); hud.message('Onda ' + d.wave, d.name || 'Bots e Jogadores!', 2.5); audio.wave(); } });
net.on('ewaveclear', (d) => { if (!net.isHost) { hud.message('Onda ' + d.wave + ' Concluída', 'Prepare-se para a próxima onda!', 2.5); audio.waveClear(); player.hp = Math.min(player.maxHp, player.hp + 40); player.addCash(300 + 50 * d.wave, 'Onda Concluída'); } });
net.on('ehit', (d, from) => {
  if (!net.isHost) return;
  const e = enemies.byId.get(d.id);
  if (!e || !e.alive) return;
  const info = {
    crit: !!(d.info && d.info.crit),
    part: (d.info && d.info.part) || 'torso',
    source: 'remote_bullet',
    point: d.info && d.info.point ? new THREE.Vector3().fromArray(d.info.point) : e.center.clone(),
    dir: d.info && d.info.dir ? new THREE.Vector3().fromArray(d.info.dir) : new THREE.Vector3(0, 1, 0),
    by: from
  };
  enemies.damage(e, d.amount, info);
  if (!e.alive) {
    const sc = scores.get(from);
    const kname = sc ? sc.name : 'Jogador';
    net.sendTo(from, 'ekillcredit', { pts: e.T.score, cash: 125 + (info.crit ? 75 : 0), label: e.T.name });
    net.send('feed', { text: kname + ' eliminou ' + e.T.name + (info.crit ? ' (Tiro na Cabeça)' : '') });
  }
});

net.on('pdead', (d, from) => {
  const r = remote.get(from); const vn = r ? r.name : 'Alguém'; const kn = d.killer && scores.get(d.killer) ? scores.get(d.killer).name : null;
  if (r) { r.ragdoll(d.dir ? new THREE.Vector3().fromArray(d.dir) : null, !!d.over); audio.enemyDie(r.center); }
  const how = d.how ? ' · ' + d.how + (d.crit ? ' Tiro na Cabeça' : '') : '';
  if (d.killer === net.id) { game.kills++; game.addScore(150, 'Eliminou ' + vn + how); player.addCash(300, 'Eliminação PvP'); audio.kill(true); }
  else hud.kill(kn ? kn + ' eliminou ' + vn + how : vn + ' caiu da página', 0);
  if (net.isHost) tallyDeath(from, d.killer);
});
net.on('nade', (d) => player.throwGrenade(d));
net.on('rocket', (d) => player.fireRocket(d));
net.on('brk', (d) => { const br = level.breakables[d.id]; if (br) breakProp(br, null, false); });
net.on('parry', (d) => { audio.shieldHit(player.center); input.rumble(0.35, 0.3, 60); effects.strokeBurst(player.eye.clone().addScaledVector(player.forward, 0.5), INK.ORANGE, 8, 5, { life: 0.2, size: 0.03 }); hud.kill(d.ret ? 'Rebatido' : 'Desviado', d.ret ? 25 : 0); });
net.on('shots', (d, from) => {
  const r = remote.get(from); if (!r || !r.root || !r.alive) return;
  _sm.set(r.body.pos.x + r.right.x * 0.3 + r.forward.x * 0.8, r.body.pos.y + 1.35 + r.forward.y * 0.8, r.body.pos.z + r.right.z * 0.3 + r.forward.z * 0.8);
  const th = TRACER_THICK[d.k] || 0.02; const e = d.e || [];
  for (let i = 0; i + 2 < e.length; i += 3) { _se.set(e[i], e[i + 1], e[i + 2]); effects.tracer(_sm, _se, INK.BLUE, th, 0.06); }
  r.flash(); audio.remoteShot(d.k, _sm);
});
net.on('cut', () => { if (player.grapple.state !== 'idle') { player.detachGrapple(false); effects.strokeBurst(player.center, INK.ORANGE, 8, 4, { life: 0.25, size: 0.03 }); hud.tip('Sua corda foi cortada!', 1.3); input.rumble(0.5, 0.3, 80); } });
net.on('score', (rows) => { if (!net.isHost) applyScores(rows); });
net.on('fell', (d, from) => { if (!net.isHost) return; const sc = scores.get(from); if (sc) { sc.kills = Math.max(0, sc.kills - 1); sendScores(); net.send('feed', { text: sc.name + ' caiu da página · -1' }); hud.kill(sc.name + ' caiu da página · -1', 0); } });
net.on('feed', (d) => hud.kill(String(d.text || ''), 0));
player.onFall = () => {
  if (!online() || !inMatch()) return;
  hud.kill('Caiu da página · -1 eliminação', 0);
  if (net.isHost) { const sc = scores.get(net.id); if (sc) { sc.kills = Math.max(0, sc.kills - 1); sendScores(); net.send('feed', { text: sc.name + ' caiu da página · -1' }); } }
  else net.send('fell', {});
};
net.on('clock', (d) => { if (!net.isHost) { matchLeft = d.left; clockRunning = !!d.on; } });

// ---- idle players: a warning, then out; a lobby with nobody active in it shuts down ----
const IDLE_FLAG = 30, IDLE_MATCH = 150, IDLE_LOBBY = 300, IDLE_WARN = 20;
let idleWarned = false, idleCheckT = 0;
function idleUpdate(dt) {
  if (!net.active) { idleWarned = false; return; }
  idleCheckT -= dt; if (idleCheckT > 0) return; idleCheckT = 1;
  const limit = inMatch() ? IDLE_MATCH : IDLE_LOBBY; const idle = input.idleSeconds;
  const othersActive = [...remote.values()].some((r) => !r.idle);
  // a host that still has active players stays; kicking it would end their match
  const canDrop = !net.isHost || !othersActive;
  if (idle > limit - IDLE_WARN && !idleWarned && canDrop) { idleWarned = true; hud.message('Ainda aí?', 'Mova-se para não ser desconectado por inatividade', 3); audio.empty(); }
  if (idle <= limit - IDLE_WARN) idleWarned = false;
  if (idle > limit && canDrop) { const back = net.isHost ? null : String(net.aliasCode || net.code || '').replace(/-\d+$/, ''); leaveOnline(net.isHost ? 'Sala fechada por inatividade' : 'Desconectado por inatividade'); lobby.rejoinCode = back; if (back) showStart(); return; }
  // the host also clears out a client that has sat idle past the limit, in case its tab cannot do it itself
  if (net.isHost) for (const [id, r] of remote) if (r.idle && r.idleSince && performance.now() / 1000 - r.idleSince > limit - IDLE_FLAG + 15) { net.sendTo(id, 'kick', { reason: 'Desconectado por inatividade' }); const c = net.conns.get(id); setTimeout(() => { try { c && c.close(); } catch (e) { /* ignore */ } }, 500); }
}
net.on('kick', (d) => { const back = String(net.aliasCode || net.code || '').replace(/-\d+$/, ''); leaveOnline(d && d.reason || 'Desconectado da sala'); lobby.rejoinCode = back; if (back) showStart(); });
let syncTick = 0;
function netUpdate(dt) {
  idleUpdate(dt);
  if (!net.active) return; const now = performance.now() / 1000; syncTick++;
  if (net.isHost && inMatch() && syncTick % 3 === 0) {
    net.send('esnap', enemies.snapshot());
  }
  for (const r of remote.values()) r.update(dt, now);
  // a connection that died without saying so leaves a figure standing around: drop anyone silent too long
  if (inMatch() && !migrating) for (const [id, r] of remote) { if (r.lastSeen && performance.now() - r.lastSeen > 9000) { if (!net.isHost && id === net.hostId) { net.leave(); migrateHost(); break; } const nm = r.name; removeRemote(id); hud.kill(nm + ' desconectou', 0); if (net.isHost) { const c = net.conns.get(id); if (c) { try { c.close(); } catch (e) { /* ignore */ } net.conns.delete(id); } net.send('leave', { id }); broadcastLobby(); sendScores(); } } }
  if (syncTick % 3 === 0 && inMatch()) net.send('ps', encodeLocal(player, player.weaponIndex, { firing: player.firing, idle: input.idleSeconds > IDLE_FLAG }), true);
  if (shotQueue.length) net.broadcast('shots', { k: player.weapon.kind, e: shotQueue.splice(0) });
  if (net.isHost && inMatch() && remote.size > 0) game.clockStarted = true;
  const clockOn = inMatch() && !game.over && (net.isHost ? !!game.clockStarted : clockRunning);
  if (inMatch() && !game.over) { if (clockOn) matchLeft = Math.max(0, matchLeft - dt); if (net.isHost) { clockT -= dt; if (clockT <= 0) { clockT = 2; net.send('clock', { left: Math.round(matchLeft), on: clockOn }); } } hud.setTimer(clockOn ? mmss(matchLeft) : 'Inicia com 2+ jogadores'); }
  if (net.isHost && clockOn) { game.matchT += dt; if (matchLeft <= 0) { const rows = sortedScores(); const w = rows.length ? { id: rows[0][0], name: rows[0][1].name } : { id: net.id, name: myName }; net.send('end', w); endMatch(w); } }
}
function leaveOnline(reason) {
  net.leave(); for (const id of [...remote.keys()]) removeRemote(id); lobby.players.clear(); scores.clear(); hud.setBoard(null);
  if (game.state !== 'start') { game.state = 'start'; game.mode = 'solo'; setArena(false); resetGame(); hud.setGameplayVisible(false); }
  game.menu = false; lobby.status = reason || ''; screen = 'online'; showStart();
}
async function createLobby(mode) {
  setStatus('Criando sala…');
  const isLan = mode === 'lan';
  const isPublic = mode === 'public';
  try {
    await net.host({ isPublic, isInternal: isLan, mode });
  }
  catch (err) { setStatus(friendlyError(err)); unlockButtons(); return; }
  lobby.isPublic = isPublic; lobby.isLan = isLan; lobby.mode = mode; lobby.map = mapKey; lobby.players.clear(); lobby.players.set(net.id, { name: myName }); lobby.hostId = net.id; lobby.status = '';
  game.state = 'lobby'; screen = 'lobby'; showStart();
}
async function joinLobby(code, forceLan = false) {
  setStatus('Conectando…');
  try { await net.join(code, { name: myName, isInternal: forceLan, mode: forceLan ? 'lan' : undefined }); }
  catch (err) { setStatus(friendlyError(err)); unlockButtons(); return; }
  lobby.isPublic = net.isPublic; lobby.isLan = net.isInternal; lobby.status = ''; game.state = 'lobby'; screen = 'lobby'; showStart();
}
async function quickPlay() {
  try { await net.quickJoin({ name: myName }, setStatus); lobby.isPublic = true; lobby.status = ''; game.state = 'lobby'; screen = 'lobby'; showStart(); return; }
  catch (err) { if (!/no open public/.test(String(err.message))) { setStatus(friendlyError(err)); unlockButtons(); return; } }
  setStatus('Nenhuma sala aberta · Criando nova sala pública…');
  await createLobby(true);
}
function friendlyError(err) {
  const m = String(err && err.message || err || ''); if (!m) return 'Ocorreu um erro';
  if (/networking library/.test(m)) return 'Biblioteca de rede não carregou · Verifique sua conexão';
  if (/timed out|signalling/.test(m)) return 'Tempo esgotado no servidor de sinalização';
  if (/no lobby with that code/.test(m)) return 'Nenhuma sala com esse código · Verifique o código com seus colegas';
  if (/no answer/.test(m)) return 'Sala encontrada, mas sem resposta de conexão';
  if (/full/.test(m)) return 'A sala está cheia · Tente outro código';
  if (/leave the lobby/.test(m)) return 'Saia da sala atual primeiro';
  return m;
}
function setStatus(t) { lobby.status = t; const el = hud.el.panel.querySelector('#status'); if (el) el.textContent = t; }

// ---------------- screens ----------------
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

  const colorSwatches = PRESET_COLORS.map(c => 
    `<span class="ch-swatch${hudPrefs.chColor.toLowerCase() === c.hex.toLowerCase() ? ' active' : ''}" data-color="${c.hex}" title="${c.name}" style="background:${c.hex}"></span>`
  ).join('');

  return `<div class="settings" id="settings">
    <div class="settings-section-title">⚙️ Controles & Som</div>
    <div class="settings-grid">
      <label class="settings-row">Sensibilidade do Mouse <input type="range" id="setSens" min="25" max="250" step="5" value="${settings.sens}"><b id="setSensV">${settings.sens}%</b></label>
      <label class="settings-row"><input type="checkbox" id="setInv" ${settings.invert ? 'checked' : ''}> Inverter Eixo Y</label>
      <label class="settings-row"><input type="checkbox" id="setMus" ${musicWanted ? 'checked' : ''}> Música de Fundo <span class="k">(M)</span></label>
    </div>

    <div class="settings-section-title">🎯 Personalizar Mira (Crosshair)</div>
    <div class="settings-row" style="justify-content:center; gap:12px; margin-top:4px;">
      <span>Cor da Mira:</span>
      <div class="ch-palette">${colorSwatches}</div>
      <input type="color" id="chColorPicker" value="${hudPrefs.chColor}" title="Cor Personalizada" style="cursor:pointer; width:30px; height:26px; border:2px solid var(--ink); border-radius:4px; padding:0; background:none;">
    </div>
    <div class="settings-grid" style="margin-top:6px;">
      <label class="settings-row">Tamanho da Mira
        <select id="setChSize" style="font-family:inherit; font-size:16px; border:2px solid var(--ink); border-radius:5px; padding:2px 8px; background:var(--paper); color:var(--ink);">
          <option value="0.75" ${hudPrefs.chSize === 0.75 ? 'selected' : ''}>Pequena</option>
          <option value="1" ${hudPrefs.chSize === 1 ? 'selected' : ''}>Média (Padrão)</option>
          <option value="1.35" ${hudPrefs.chSize === 1.35 ? 'selected' : ''}>Grande</option>
        </select>
      </label>
      <label class="settings-row"><input type="checkbox" id="setChDot" ${hudPrefs.chDot ? 'checked' : ''}> Ponto Central da Mira</label>
    </div>

    <div class="settings-section-title">🖥️ Editar Interface (HUD)</div>
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
  </div>`;
}

function wireSettings() {
  const box = hud.el.panel.querySelector('#settings'); if (!box) return;
  box.addEventListener('click', (e) => e.stopPropagation()); box.addEventListener('keydown', (e) => e.stopPropagation());
  const sens = box.querySelector('#setSens'), out = box.querySelector('#setSensV');
  sens.addEventListener('input', () => { settings.sens = Number(sens.value); out.textContent = settings.sens + '%'; applySettings(); });
  box.querySelector('#setInv').addEventListener('change', (e) => { settings.invert = e.target.checked; applySettings(); });
  box.querySelector('#setMus').addEventListener('change', (e) => { musicWanted = e.target.checked; localStorage.setItem('doodle_music', musicWanted ? '1' : '0'); audio.musicOn(musicWanted); });

  // Cor da mira via paleta
  box.querySelectorAll('.ch-swatch').forEach(sw => {
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      box.querySelectorAll('.ch-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      hudPrefs.chColor = sw.dataset.color;
      const cp = box.querySelector('#chColorPicker');
      if (cp) cp.value = hudPrefs.chColor;
      applyHudSettings();
    });
  });

  // Cor da mira via color picker
  const cp = box.querySelector('#chColorPicker');
  if (cp) cp.addEventListener('input', (e) => {
    hudPrefs.chColor = e.target.value;
    box.querySelectorAll('.ch-swatch').forEach(s => s.classList.toggle('active', s.dataset.color.toLowerCase() === hudPrefs.chColor.toLowerCase()));
    applyHudSettings();
  });

  // Tamanho da mira
  const chs = box.querySelector('#setChSize');
  if (chs) chs.addEventListener('change', (e) => {
    hudPrefs.chSize = Number(e.target.value);
    applyHudSettings();
  });

  // Ponto central
  const chd = box.querySelector('#setChDot');
  if (chd) chd.addEventListener('change', (e) => {
    hudPrefs.chDot = e.target.checked;
    applyHudSettings();
  });

  // Escala HUD
  const hs = box.querySelector('#setHudScale'), hsV = box.querySelector('#setHudScaleV');
  if (hs) hs.addEventListener('input', () => {
    hudPrefs.scale = Number(hs.value);
    if (hsV) hsV.textContent = hudPrefs.scale + '%';
    applyHudSettings();
  });

  // Opacidade HUD
  const ho = box.querySelector('#setHudOpacity'), hoV = box.querySelector('#setHudOpacityV');
  if (ho) ho.addEventListener('input', () => {
    hudPrefs.opacity = Number(ho.value);
    if (hoV) hoV.textContent = hudPrefs.opacity + '%';
    applyHudSettings();
  });

  // Toggles HUD
  const hkf = box.querySelector('#setHudKf');
  if (hkf) hkf.addEventListener('change', (e) => {
    hudPrefs.killfeed = e.target.checked;
    applyHudSettings();
  });
  const hdmg = box.querySelector('#setHudDmg');
  if (hdmg) hdmg.addEventListener('change', (e) => {
    hudPrefs.damageNums = e.target.checked;
    applyHudSettings();
  });
}
function wireName(box) {
  const nb = box.querySelector('#setName'); if (!nb) return;
  nb.addEventListener('input', (e) => { myName = e.target.value.trim().slice(0, 14) || myName; localStorage.setItem('doodle_name', myName); player.name = myName; net.hostName = myName; });
}
function checkpointHTML() {
  if (checkpoint < 5) return '';
  let h = '<div class="checkpoints"><span>Pontos de Controle</span>';
  for (let w = 5; w <= checkpoint; w += 5) h += `<button type="button" data-cp="${w}">Onda ${w}</button>`;
  return h + '</div>';
}
function wireCheckpoints(onGo) { const box = hud.el.panel.querySelector('.checkpoints'); if (!box) return; box.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('button'); if (b) onGo(Number(b.dataset.cp)); }); }
const mapName = (k) => (LEVELS.find((m) => m.key === k) || LEVELS[0]).name;
function mapHTML(sel, canPick) { if (LEVELS.length < 2) return ''; return `<div class="mapsel" id="mapsel"><span>Mapa</span>${LEVELS.map((m) => `<button type="button" class="mapbtn${m.key === sel ? ' on' : ''}" data-map="${m.key}" ${canPick ? '' : 'disabled'}>${m.name}<i>${m.blurb}</i></button>`).join('')}</div>`; }
function wireMap(onPick) { const box = hud.el.panel.querySelector('#mapsel'); if (!box) return; box.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('.mapbtn'); if (b && !b.disabled) onPick(b.dataset.map); }); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function mainHTML() {
  return `<h1>Doodle District</h1><h2>Jogo de tiro e sobrevivência desenhado em caderno</h2>
    <div class="mainbtns"><button type="button" class="start" id="soloBtn">JOGAR SOLO<i>Sobreviva a ondas de rabiscos</i></button><button type="button" id="onlineBtn">JOGAR ONLINE<i>Mata-Mata Livre · Até 10 jogadores</i></button></div>
    ${mapHTML(mapKey, true)}${CONTROLS_HTML}${settingsHTML()}${checkpointHTML()}${best ? `<div class="beststat">Recorde: ${best}</div>` : ''}`;
}
function onlineHTML() {
  return `<h1>Jogar Online</h1><h2>Mata-Mata Livre · Primeiro a ${FFA_TARGET} eliminações · Até 10 jogadores</h2>
    <div class="online" id="online">
      <div class="row"><span>Seu Apelido</span><input type="text" class="namebox" id="setName" maxlength="14" placeholder="Seu apelido" value="${esc(myName)}"></div>
      <div class="row"><button type="button" class="big" id="quickBtn">Partida Rápida</button><span class="hint">Entra em qualquer sala aberta ou cria uma nova</span></div>
      <div class="row split"><span>ou</span></div>
      <div class="row"><button type="button" id="createBtn">Criar Sala</button><div class="radio" style="display:flex; flex-wrap:wrap; gap:10px;"><label><input type="radio" name="vis" value="public" ${lobby.mode === 'public' || (!lobby.mode && lobby.isPublic) ? 'checked' : ''}> 🌐 Pública (Global)</label><label><input type="radio" name="vis" value="private" ${lobby.mode === 'private' || (!lobby.mode && !lobby.isPublic && !lobby.isLan) ? 'checked' : ''}> 🔒 Privada (Global)</label><label style="color:#0077aa; font-weight:bold;"><input type="radio" name="vis" value="lan" ${lobby.mode === 'lan' || lobby.isLan ? 'checked' : ''}> 🏢 Sala Interna (GDFNet / Mesma Rede)</label></div></div>
      <div class="row"><span>Tem o código da sala?</span><input type="text" id="codeBox" placeholder="CÓDIGO" maxlength="12" autocomplete="off"><label style="font-size:16px; margin:0 4px;"><input type="checkbox" id="joinLanCheck"> Forçar GDFNet</label><button type="button" id="joinBtn">Entrar</button></div>
      <div class="lobbylist" id="lobbylist"><div class="row"><span>Salas Abertas</span><button type="button" class="alt" id="refreshBtn">Atualizar</button></div><div class="rows" id="lobbyRows">${lobbyListHTML()}</div></div>
      <div class="status" id="status">${esc(lobby.status || '')}</div>
      ${lobby.rejoinCode ? `<div class="row"><button type="button" class="big" id="rejoinBtn">Reconectar a ${esc(lobby.rejoinCode)}</button></div>` : ''}
      <div class="row"><button type="button" class="alt" id="backBtn">Voltar</button></div>
    </div>`;
}
function lobbyHTML() {
  const rows = lobbyRows(); const host = net.isHost; const n = rows.length;
  return `<h1>Sala de Espera</h1><h2>Mata-Mata Livre · Primeiro a ${FFA_TARGET} eliminações · ${n}/${net.maxPlayers} jogadores</h2>
    <div class="online" id="online">
      <div class="row"><span>Código</span><span class="code">${String(net.isHost ? (net.aliasCode || net.code) : (lobby.shown || net.code) || '').replace(/-\d+$/, '')}</span> ${net.isInternal || lobby.isLan ? '<b style="color:#0077aa; font-size:20px; margin-left:8px;">[Rede Interna GDFNet]</b>' : ''}</div>
      ${mapHTML(lobby.map || mapKey, host)}
      <div class="hint">${lobby.isPublic ? 'Sala pública: qualquer um na rede ou com o código pode entrar' : 'Sala privada: passe este código de 5 letras para seus colegas entrarem'}</div>
      <div class="plist">${rows.map((p) => `<div class="${p.id === lobby.hostId ? 'host' : ''}${p.id === net.id ? ' me' : ''}"><span>${esc(p.name)}</span><span>${p.id === net.id ? ' (Você)' : ''}</span></div>`).join('')}</div>
      <div class="row"><button type="button" class="big" id="startBtn">Iniciar Partida</button><button type="button" class="alt" id="leaveBtn">Sair da Sala</button></div>
      <div class="status" id="status">${esc(lobby.status || '')}</div><div class="hint">Qualquer jogador pode iniciar · ${n < 2 ? 'Outros podem entrar durante a partida' : n + ' jogadores prontos'}</div>
    </div>`;
}
let lobbyList = null, listBusy = false;
function lobbyListHTML() {
  if (listBusy) return '<div class="hint">Buscando salas…</div>';
  if (!lobbyList) return '<div class="hint">Clique em Atualizar para buscar salas abertas</div>';
  if (!lobbyList.length) return '<div class="hint">Nenhuma sala pública encontrada · Crie uma ou use Partida Rápida</div>';
  return lobbyList.map((l) => `<div class="lobbyrow"><span class="code">${esc(l.code)}</span><span>${esc(l.hostName || 'Alguém')} - Sala</span><span>${l.players}/${l.max}${l.inMatch ? ' · Em partida' : ''}</span>${l.full ? '<span class="status">Lotada</span>' : `<button type="button" data-join="${esc(l.code)}">Entrar</button>`}</div>`).join('');
}
async function refreshLobbies() {
  if (listBusy || net.active) return; listBusy = true; const box = hud.el.panel.querySelector('#lobbyRows'); if (box) box.innerHTML = lobbyListHTML();
  let err = null; try { lobbyList = await net.listLobbies({ name: myName }); } catch (e) { lobbyList = []; err = e; }
  listBusy = false; const rows = hud.el.panel.querySelector('#lobbyRows'); if (rows) rows.innerHTML = err ? `<div class="hint">Falha ao buscar: ${esc(friendlyError(err))}</div>` : lobbyListHTML();
}
function wireOnline() {
  const box = hud.el.panel.querySelector('#online'); if (!box) return;
  box.addEventListener('click', (e) => e.stopPropagation()); box.addEventListener('keydown', (e) => e.stopPropagation());
  const q = (id) => box.querySelector('#' + id); wireName(box);
  if (q('quickBtn')) q('quickBtn').addEventListener('click', () => { lockButtons(box); quickPlay(); });
  if (q('createBtn')) q('createBtn').addEventListener('click', () => {
    lockButtons(box);
    const sel = box.querySelector('input[name=vis]:checked');
    createLobby(sel ? sel.value : 'public');
  });
  if (q('joinBtn')) {
    q('joinBtn').addEventListener('click', () => {
      const c = q('codeBox').value.trim().toUpperCase();
      if (!c) { setStatus('Digite o código da sala'); return; }
      lockButtons(box);
      const forceLan = q('joinLanCheck') && q('joinLanCheck').checked;
      joinLobby(c, forceLan);
    });
    q('codeBox').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('joinBtn').click(); });
  }
  if (q('rejoinBtn')) q('rejoinBtn').addEventListener('click', () => { const c = lobby.rejoinCode; lobby.rejoinCode = null; lockButtons(box); joinLobby(c); });
  if (q('backBtn')) q('backBtn').addEventListener('click', () => { lobby.status = ''; lobby.rejoinCode = null; screen = 'main'; showStart(); });
  if (q('refreshBtn')) { q('refreshBtn').addEventListener('click', () => refreshLobbies()); if (!lobbyList && !listBusy) refreshLobbies(); }
  if (q('lobbyRows')) q('lobbyRows').addEventListener('click', (e) => { const b = e.target.closest('button[data-join]'); if (b) { lockButtons(box); joinLobby(b.dataset.join); } });
  wireMap((k) => { if (net.isHost) { lobby.map = k; broadcastLobby(); } });
  if (q('startBtn')) q('startBtn').addEventListener('click', () => { if (net.isHost) hostStart(); else { net.send('startreq', {}); setStatus('Solicitando início ao anfitrião…'); } });
  if (q('leaveBtn')) q('leaveBtn').addEventListener('click', () => { lobby.rejoinCode = null; leaveOnline(''); });
}
function lockButtons(box) { for (const b of box.querySelectorAll('button')) if (b.id !== 'backBtn') b.disabled = true; }
function unlockButtons() { const box = hud.el.panel.querySelector('#online'); if (box) for (const b of box.querySelectorAll('button')) b.disabled = false; }
function renderLobby() { if (game.state === 'lobby') showStart(); }
function showStart() {
  hud.setGameplayVisible(false);
  if (game.state === 'lobby') screen = 'lobby';
  const html = screen === 'lobby' ? lobbyHTML() : screen === 'online' ? onlineHTML() : mainHTML();
  hud.showScreen(html);
  const p = hud.el.panel;
  if (screen === 'main') {
    wireSettings(); wireCheckpoints((w) => beginAtWave(w)); wireMap((k) => { mapKey = k; localStorage.setItem('doodle_map', k); showStart(); });
    p.querySelector('#soloBtn').addEventListener('click', (e) => { e.stopPropagation(); begin(); });
    p.querySelector('#onlineBtn').addEventListener('click', (e) => { e.stopPropagation(); screen = 'online'; showStart(); });
  } else wireOnline();
}
function showPause() {
  if (online()) {
    hud.showScreen(`<h1>Menu</h1><h2>Mata-Mata Livre · Sala ${String(net.aliasCode || net.code || '').replace(/-\d+$/, '')}</h2><div class="scoreboard">${sortedScores().map(([id, s]) => `<div class="${id === net.id ? 'me' : ''}"><span>${esc(s.name)}</span><span>${s.kills} Kills · ${s.deaths} Mortes</span></div>`).join('')}</div>${CONTROLS_HTML}${settingsHTML()}<div class="online" id="online"><div class="row"><button type="button" class="alt" id="leaveBtn">Sair da Partida</button></div></div><div class="go">Clique ou pressione ${hud.key('confirm')} para continuar</div>`);
    wireSettings(); wireOnline(); return;
  }
  hud.showScreen(`<h1>Jogo Pausado</h1><h2>Onda ${game.wave} · ${game.score} Pontos</h2>${CONTROLS_HTML}${settingsHTML()}${menuBtnHTML()}<div class="go">Clique ou pressione ${hud.key('confirm')} para continuar</div>`);
  wireSettings(); wireMenuBtn();
}
function showClickToPlay() { hud.showScreen(`<h1>Partida Iniciada</h1><h2>Mata-Mata Livre · Primeiro a ${FFA_TARGET} kills</h2><div class="go">Clique ou pressione ${hud.key('confirm')} para lutar</div>`); }
function showDead() {
  hud.setGameplayVisible(false); const nb = game.score > best; if (nb) { best = game.score; localStorage.setItem('doodle_best', String(best)); }
  hud.showScreen(`<h1>Você Foi Apagado</h1><div class="stats">Você sobreviveu a <b>${game.wave}</b> ondas · <b>${game.kills}</b> eliminações · <b>${game.score}</b> pontos${nb ? ' · <b>Novo Recorde!</b>' : ` · Recorde: ${best}`}</div>${checkpointHTML()}${menuBtnHTML()}<div class="go">Clique ou pressione ${hud.key('confirm')} para tentar novamente</div>`);
  wireCheckpoints((w) => beginAtWave(w)); wireMenuBtn();
}
function menuBtnHTML() { return '<div class="online menubtn"><div class="row"><button type="button" class="alt" id="menuBtn">Menu Principal</button></div></div>'; }
function wireMenuBtn() { const b = hud.el.panel.querySelector('#menuBtn'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); toMainMenu(); }); }
function toMainMenu() { game.state = 'start'; game.mode = 'solo'; game.menu = false; setArena(false); resetGame(); audio.reelLoop(false); input.exitLock(); hud.setGameplayVisible(false); screen = 'main'; showStart(); }
function toLobbyScreen() { net.inMatch = false; for (const r of remote.values()) r.lastSeen = performance.now(); setArena(true); resetGame(); game.state = 'lobby'; game.over = null; game.menu = false; hud.setGameplayVisible(false); hud.setBoard(null); screen = 'lobby'; showStart(); }

// ---------------- run control ----------------
function resetGame() {
  if (level.breakables.some((b) => !b.alive)) setLevel(loadedKey, arenaLoaded, true);
  enemies.clear(); effects.clear(); survival.clearPickups();
  player.maxHp = online() ? 110 : 120; player.regenDelay = online() ? 4 : 4.5; player.regenRate = online() ? 14 : 11;
  player.reset(level.playerStart); player.name = myName; player.lastHitBy = null; player.lastHit = null; enemies.mods.speed = 1; enemies.mods.damage = 1; hud.setModifier(''); hud.setBoss(null, null); game.boss = null; endFocus(); game.katanaStreak = 0;
  if (level.key === 'brasilia' && (!online() || net.isHost)) {
    spawnBrasiliaCivilians();
  }
  game.score = 0; game.kills = 0; game.combo = 0; game.wave = 0; game.intermission = 0; game.queue = []; game.time = 0; game.over = null; game.matchT = 0; hud.setScore(0, 0); hud.setTimer(''); hud.setPvpScore(null); hud.setWave(1, 0); hud.setBoard(null);
}
function beginCommon() { audio.init(); audio.resume(); if (!input.usingGamepad) input.requestLock(); if (musicWanted && !audio.musicPlaying) audio.musicOn(true); hud.hideScreen(); hud.setGameplayVisible(true); game.menu = false; }
function begin() { game.mode = 'solo'; setArena(false); beginCommon(); if (game.state === 'start' || game.state === 'dead') { resetGame(); startWave(1); } game.state = 'play'; }
function beginAtWave(n) { game.mode = 'solo'; setArena(false); beginCommon(); resetGame(); startWave(n); game.state = 'play'; }
function jumpToWave(n) { enemies.clear(); effects.clear(); enemies.mods.speed = 1; enemies.mods.damage = 1; endFocus(); game.intermission = 0; game.queue = []; startWave(n); hud.hideScreen(); hud.setGameplayVisible(true); game.state = 'play'; game.menu = false; audio.reelLoop(false); }
function hostStart() {
  scores.clear(); for (const [id, p] of lobby.players) scores.set(id, { name: p.name, kills: 0, deaths: 0 });
  // random map rotation: every online match rolls a fresh map so no two feel the same
  lobby.map = choose(LEVELS).key;
  // deal everyone a different spot, shuffled so the same people do not always start together
  setArena(true); const order = spawnSpots().map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const spawns = {}; [...lobby.players.keys()].forEach((id, i) => { spawns[id] = order[i % order.length]; });
  net.send('start', { spawns, map: lobby.map || mapKey }); startMatch(false, spawns[net.id]); sendScores();
}
function startMatch(late, spawnIdx) {
  net.inMatch = true; game.mode = 'ffa'; setArena(true); resetGame(); matchLeft = FFA_TIME; clockT = 0; game.clockStarted = false;
  // nobody sends snapshots in the lobby, so the silence clock restarts here or the sweep would drop everyone
  for (const r of remote.values()) r.lastSeen = performance.now();
  if (!scores.size) for (const [id, p] of lobby.players) scores.set(id, { name: p.name, kills: 0, deaths: 0 });
  const spots = spawnSpots(); player.reset(spawnIdx != null && spots[spawnIdx] ? spots[spawnIdx].clone() : arenaSpawn()); beginCommon(); game.state = 'play'; screen = 'lobby'; player.shieldT = 2;
  enemies.mirror = !net.isHost;
  enemies.clear();
  if (net.isHost) {
    startWave(1);
  }
  refreshScoreHud(); hud.message('Mata-Mata Livre', late ? 'Você entrou em uma partida em andamento' : 'Primeiro a ' + FFA_TARGET + ' eliminações · Limite de ' + Math.round(FFA_TIME / 60) + ' min · Cada um por si', 3);
  hud.tip(`Segure <b>${hud.key('score')}</b> para ver o placar`, 5);
  // a match started by someone else's click cannot grab the mouse: ask for a click
  setTimeout(() => { if (game.state === 'play' && !input.pointerLocked && !input.usingGamepad) { game.menu = true; showClickToPlay(); } }, 250);
}
function pause() { if ((game.state !== 'play' && !(game.state === 'dying' && online())) || game.menu) return; if (!online()) game.state = 'pause'; game.menu = true; showPause(); audio.reelLoop(false); }
function resume() { if (online()) { game.menu = false; if (game.state === 'dying' && game.respawnT <= 0) game.respawnArm = input.lastActive; hud.hideScreen(); hud.setGameplayVisible(true); if (!input.usingGamepad) input.requestLock(); return; } begin(); }
Object.assign(window.__game, { startWave, updateWaves, begin, beginAtWave, jumpToWave, resetGame, spawnPickup, focusCandidate, enterFocus, pickSpawn, startMatch, createLobby, joinLobby, quickPlay, leaveOnline, hostStart });
hud.onScreenClick = () => {
  const st = game.state;
  if (st === 'over') { if (net.isHost) { net.send('backtolobby', {}); toLobbyScreen(); } return; }
  if (st === 'lobby') return;
  if (st === 'start') { if (screen === 'main') begin(); return; }
  if ((st === 'play' || st === 'dying') && game.menu) { resume(); return; }
  if (st === 'pause' || st === 'dead') resume();
};
canvas.addEventListener('click', () => { if (game.state === 'play' && !game.menu && !input.pointerLocked && !input.usingGamepad) input.requestLock(); });
input.onLockChange = (locked) => { if (!locked && (game.state === 'play' || (game.state === 'dying' && online())) && !game.menu && !input.usingGamepad) pause(); };
input.onDeviceChange = (pad) => { hud.setDevice(pad); hud.setWeapon(player.weapon.name, player.weapon.hint); };
window.addEventListener('pagehide', () => { if (net.active) net.leave(); });
// browsers only let audio start on a gesture; any press wakes the context if it went to sleep
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { audio.init(); audio.resume(); }, { passive: true });
hud.setDevice(input.usingGamepad);
applySettings();
hud.onCloseBuy = () => {
  if (game.state === 'play' && !input.usingGamepad) input.requestLock();
};
hud.setWeapon(player.weapon.name, player.weapon.hint);
showStart();

// ---------------- loop ----------------
let last = performance.now(), boardToggle = false, lockTipT = 0.5, musicHealT = 2;
function tick(now) { requestAnimationFrame(tick); step(now); }
// browsers starve animation frames in hidden tabs; a host that alt-tabs would freeze everyone's
// match, so a coarse timer runs extra steps (never extra frame chains) while that happens
setInterval(() => { if (net.active && performance.now() - last > 300) step(performance.now()); }, 250);
function step(now) {
  // never more than 50 ms a step: a bigger jump (a tab coming back) makes the springs in the view model fly apart
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  input.update(dt);
  const st = game.state; const playing = st === 'play' || st === 'dying';
  if (st === 'start' || st === 'pause' || st === 'dead' || st === 'over') { if (input.pressed('jump') || input.pressed('confirm') || (st === 'pause' && input.pressed('pause'))) hud.onScreenClick(); }
  if (playing && input.pressed('buy')) {
    if (hud.el.buymenu.hidden) { hud.toggleBuyMenu(true, player); input.exitLock(); }
    else { hud.toggleBuyMenu(false); if (!input.usingGamepad) input.requestLock(); }
  }
  else if ((st === 'play' || (st === 'dying' && online())) && input.pressed('pause')) {
    if (!hud.el.buymenu.hidden) { hud.toggleBuyMenu(false); if (!input.usingGamepad) input.requestLock(); }
    else if (game.menu) resume();
    else { pause(); input.exitLock(); }
  }
  else if ((st === 'play' || st === 'dying') && game.menu && (input.pressed('jump') || input.pressed('confirm'))) resume();
  if (input.pressed('music')) { musicWanted = !musicWanted; localStorage.setItem('doodle_music', musicWanted ? '1' : '0'); audio.musicOn(musicWanted); hud.tip(musicWanted ? 'Música Ligada' : 'Música Desligada', 1.5); }
  if (online() && playing) {
    if (input.usingGamepad && input.pressed('score')) boardToggle = !boardToggle;
    const want = ((input.down('score') && !input.usingGamepad) || boardToggle) && !game.menu; if (want !== !hud.el.board.hidden) hud.setBoard(want ? boardHTML() : null);
  } else boardToggle = false;
  if (st === 'play' && !game.menu && !input.pointerLocked && !input.usingGamepad) { lockTipT -= dt; if (lockTipT <= 0) { lockTipT = 2.5; hud.tip('Clique na tela para travar o cursor', 2); } }
  let scale = 1;
  if (game.hitstopT > 0) { game.hitstopT -= dt; scale = game.hitstopScale; }
  else if (game.focus.active) scale = FOCUS_SCALE;
  const sdt = dt * scale;
  if (st === 'play' && !online()) updateFocus(dt); else endFocus();
  if (playing) {
    game.time += sdt; if (player.shieldT > 0) player.shieldT -= dt;
    musicHealT -= dt; if (musicHealT <= 0) { musicHealT = 2; if (musicWanted && st === 'play' && !audio.musicPlaying && audio.ctx) audio.musicOn(true); if (input.anyInput) audio.resume(); }
    { const B = level.bounds, bp = player.body.pos; if (bp.x < B.minX - 8 || bp.x > B.maxX + 8 || bp.z < B.minZ - 8 || bp.z > B.maxZ + 8 || bp.y > 150) bp.y = -100; }
    if (level.cars && playing && player.alive) {
      for (const car of level.cars) {
        const dx = Math.abs(player.body.pos.x - car.laneX);
        const dz = Math.abs(player.body.pos.z - car.z);
        if (dx < (car.w / 2 + 0.6) && dz < (car.d / 2 + 0.7) && Math.abs(player.body.pos.y) < 2.2) {
          if (!car._hornT || performance.now() - car._hornT > 1000) {
            car._hornT = performance.now();
            audio.horn(car.group.position);
          }
          const pushDirX = car.laneX < 0 ? 1 : -1;
          player.knockback(new THREE.Vector3(pushDirX * 0.8, 0.35, car.dir * 0.5).normalize(), 9);
          player.takeDamage(14, car.group.position);
          hud.kill('Impacto de Trânsito · -14 Vida', 0);
        }
      }
    }
    player.update(sdt); enemies.update(sdt); effects.update(sdt); updatePickups(sdt); netUpdate(dt);
    if (st === 'play' && (!online() || net.isHost)) {
      updateWaves(sdt);
      if (level.key === 'brasilia') {
        brasiliaEventTimer -= sdt;
        if (brasiliaEventTimer <= 0) {
          brasiliaEventTimer = 80;
          const aliveProt = enemies.enemies.filter(e => e.alive && e.T.isProtester).length;
          if (aliveProt < 3) triggerBrasiliaManifestation();
        }
      }
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
          // waiting on a press: any key, button or click brings you back; pause opens the menu instead
          game.promptT -= dt; if (game.promptT <= 0) { game.promptT = 1.4; hud.message('Pronto', `Pressione ${hud.key('confirm')} ou clique para renascer`, 1.5); }
          if (input.lastActive !== game.respawnArm && !input.pressed('pause') && !input.down('pause')) respawnLocal();
        }
      }
      else if (game.deathT > 1.7) { game.state = 'dead'; showDead(); input.exitLock(); }
    }
  } else {
    game.time += dt; if (st === 'start' || st === 'dead' || st === 'lobby' || st === 'over') player.idleCam(game.time); effects.update(dt); if (net.active) netUpdate(dt);
    if (st === 'over') { game.overT += dt; if (net.isHost && game.overT > 8) { net.send('backtolobby', {}); toLobbyScreen(); } else if (!net.isHost && game.overT > 15) { toLobbyScreen(); } }
  }
  for (const a of level.animated) a.update(game.time);
  audio.setListener(player.eye, player.right);
  const w = player.weapon; if (w.isGun) hud.setAmmo(w.mag, w.reserve, w.magSize, w.reloading); else hud.setKatana();
  hud.setSlots(player.weapons.map((wp, i) => ({ name: wp.name, active: i === player.weaponIndex, ammo: wp.owned ? (wp.isGun ? wp.mag + '/' + wp.reserve : '∞') : 'Bloqueada', empty: wp.isGun && wp.mag === 0 && wp.reserve === 0, locked: !wp.owned })));
  hud.setGrenades(player.grenades); hud.setGrappleStamina(player.grapStam); hud.setHealth(player.hp, player.maxHp); hud.setSpread(w.spreadPx); hud.update(dt);
  if (online()) hud.setFocusMeter(playing, player.grapStam, false, 'Gancho');
  else hud.setFocusMeter(playing && (w.kind === 'katana' || game.katanaStreak > 0 || game.focus.active), game.focus.active ? 1 : clamp(game.katanaStreak / KATANA_CHARGE_KILLS, 0, 1), game.focus.active, 'Katana');
  if (game.boss) { if (game.boss.alive) hud.setBoss(game.boss.T.name, game.boss.hp / game.boss.maxHp); else { hud.setBoss(null, null); game.boss = null; } }
  audio.setIntensity(clamp((enemies.alive + game.queue.length + remote.size * 2) / 12, 0, 1) * (game.intermission > 0 ? 0.25 : 1));
  R.render(game.time, { hurt: player.hurtFx, flash: player.flashFx, slow: scale < 1 ? 1 : 0, lowHp: player.alive && player.hp < 30 ? 1 - player.hp / 30 : 0 });
}
requestAnimationFrame(tick);
