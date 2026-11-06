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
import { BotBatcher } from './enemies/batch.js';
import { Minimap } from './minimap.js';
import { Player } from './player/index.js';
import { RemotePlayer, encodeLocal } from './players.js';
import { Net } from './net.js';
import { HUD, CONTROLS_HTML } from './hud.js';
import { audio } from './audio.js';
import { rand, choose, clamp } from './util.js';
import { createSurvival } from './game/survival.js';
import { createBrasiliaEvents } from './game/brasiliaEvents.js';
import { escHtml, sanitizeName, sanitizeText, clampNum, sanitizeVec3, sanitizeShots, sanitizePlayerState } from './security.js';

const esc = escHtml;

const canvas = document.getElementById('c');
const R = new InkRenderer(canvas);
const world = new World();
const knownMap = (k) => (LEVELS.some((m) => m.key === k) ? k : 'district');
const navCellFor = (b) => (Math.max(b.maxX - b.minX, b.maxZ - b.minZ) > 350 ? 2.0 : 1.0);
let mapKey = knownMap(localStorage.getItem('fatal_map') || 'district');
let level = buildLevel(R.scene, world, mapKey, { arena: false });
let nav = new NavGrid(world, level.bounds, navCellFor(level.bounds)).build();
let loadedKey = mapKey, arenaLoaded = false;
let minimap = null; // created with the HUD below
audio.setTune(mapKey === 'mexico' ? 'mexico' : 'district');
// the map in play: solo uses the picked map, a match uses the host's choice; a rebuild wipes broken props
function setLevel(key, on, force = false) {
  if (!force && key === loadedKey && on === arenaLoaded) return; loadedKey = key; arenaLoaded = on;
  for (const m of level.meshes) { R.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.traverse) m.traverse((o) => { if (o !== m && o.geometry) o.geometry.dispose(); }); }
  level.animated.length = 0; world.clear(); if (ctx.bEvents) ctx.bEvents.clear();
  level = buildLevel(R.scene, world, key, { arena: on }); nav = new NavGrid(world, level.bounds, navCellFor(level.bounds)).build();
  ctx.level = level; ctx.nav = nav; if (minimap) minimap.setLevel(level, world); if (window.__game) { window.__game.level = level; window.__game.nav = nav; }
  audio.setTune(key === 'mexico' ? 'mexico' : 'district');
}
const setArena = (on) => setLevel(knownMap(net.active ? (lobby.map || mapKey) : mapKey), on);
const input = new Input(canvas);
const hud = new HUD(document.getElementById('hud'));
minimap = new Minimap(hud.root); minimap.setLevel(level, world);
const effects = new Effects(R.scene, world);
const ctx = { scene: R.scene, camera: R.camera, world, level, nav, input, hud, effects, audio, renderer: R };

// ---------------- persistent bits ----------------
let best = Number(localStorage.getItem('fatal_best') || 0);
let musicWanted = localStorage.getItem('fatal_music') !== '0';
try { localStorage.removeItem('fatal_checkpoint'); } catch (e) { /* checkpoint removido: sempre reinicia na Onda 1 */ }
// online bank: cash you carry between online matches (solo keeps its own roguelike economy)
let bank = Number(localStorage.getItem('fatal_bank') || 300); let bankSaveT = 0;
const saveBank = () => { bank = Math.max(0, Math.round(player.money)); localStorage.setItem('fatal_bank', String(bank)); };
let myName = sanitizeName(localStorage.getItem('fatal_name') || '', 'Jogador' + Math.floor(Math.random() * 90 + 10));
const settings = { sens: Number(localStorage.getItem('fatal_sens') || 100), invert: localStorage.getItem('fatal_invert') === '1' };

const hudPrefs = {
  gfxQuality: localStorage.getItem('fatal_gfx_quality') || 'medium',
  notebookMode: localStorage.getItem('fatal_notebook') === '1',
  chColor: localStorage.getItem('fatal_ch_color') || '#d02030',
  chSize: Number(localStorage.getItem('fatal_ch_size') || '1'),
  chDot: localStorage.getItem('fatal_ch_dot') !== '0',
  scale: Number(localStorage.getItem('fatal_hud_scale') || '100'),
  opacity: Number(localStorage.getItem('fatal_hud_opacity') || '100'),
  killfeed: localStorage.getItem('fatal_hud_kf') !== '0',
  damageNums: localStorage.getItem('fatal_hud_dmg') !== '0',
};
R.setQuality(hudPrefs.gfxQuality);
R.setNotebookMode(hudPrefs.notebookMode);

function applyHudSettings() {
  if (R.quality !== hudPrefs.gfxQuality) R.setQuality(hudPrefs.gfxQuality);
  R.setNotebookMode(hudPrefs.notebookMode);
  effects.maxParticles = hudPrefs.gfxQuality === 'high' ? 300 : hudPrefs.gfxQuality === 'low' ? 100 : 220;

  document.documentElement.style.setProperty('--ch-color', hudPrefs.chColor);
  document.documentElement.style.setProperty('--ch-scale', String(hudPrefs.chSize));
  
  const ch = document.getElementById('crosshair');
  if (ch) ch.style.transform = `scale(${hudPrefs.chSize})`;
  
  const dot = document.querySelector('.ch-dot');
  if (dot) dot.style.display = hudPrefs.chDot ? 'block' : 'none';

  // scale and opacity apply to the in-game readouts only (menus stay solid and full size); the scale
  // used to be saved without ever being applied
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
  localStorage.setItem('fatal_notebook', hudPrefs.notebookMode ? '1' : '0');
  localStorage.setItem('fatal_ch_color', hudPrefs.chColor);
  localStorage.setItem('fatal_ch_size', String(hudPrefs.chSize));
  localStorage.setItem('fatal_ch_dot', hudPrefs.chDot ? '1' : '0');
  localStorage.setItem('fatal_hud_scale', String(hudPrefs.scale));
  localStorage.setItem('fatal_hud_opacity', String(hudPrefs.opacity));
  localStorage.setItem('fatal_hud_kf', hudPrefs.killfeed ? '1' : '0');
  localStorage.setItem('fatal_hud_dmg', hudPrefs.damageNums ? '1' : '0');
}

function applySettings() {
  input.mouseSens = 0.0022 * settings.sens / 100; input.padSensX = 3.4 * settings.sens / 100; input.padSensY = 2.6 * settings.sens / 100; input.invertY = settings.invert;
  localStorage.setItem('fatal_sens', String(settings.sens)); localStorage.setItem('fatal_invert', settings.invert ? '1' : '0');
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
enemies.prewarm(); // every bot model is built once here, while loading, instead of mid-fight
// all bots of a kind are drawn together (instancing): a few dozen draw calls instead of hundreds
const batcher = ctx.batcher = new BotBatcher(R.scene);
R.beforeRender = (cam) => batcher.update(enemies.enemies, cam);
const player = ctx.player = new Player(ctx);
hud.onBuy = (itemKey) => {
  player.buyItem(itemKey);
  hud.toggleBuyMenu(true, player);
};
hud.setMoney(player.money);
hud.setArmor(player.armor, player.maxArmor);
player.name = myName;
const net = new Net();
const remote = ctx.remote = new Map(); // peer id -> RemotePlayer
const lobby = { players: new Map(), hostId: null, isPublic: true, status: '', code: '', map: null };
const scores = new Map();      // peer id -> { name, kills, deaths }
let screen = 'main';           // which start-screen panel is showing: main | online | lobby
window.__game = { ctx, game, player, enemies, nav, world, level, hud, effects, input, net, remote, lobby, scores };

// Solo survival systems (waves, pickups, katana focus) live in their own module; it reads live
// state through ctx (ctx.level is kept current by setLevel) and reports back through these.
const survival = createSurvival(ctx, {
  net, online,
  getCheckpoint: () => 0,
  setCheckpoint: () => {},
});
ctx.survival = survival;
// quantos jogadores estão de fato na partida (os bots crescem com isso no online)
const crowd = () => { if (!online()) return 1; let n = 1; for (const r of remote.values()) if (!r.away) n++; return Math.min(3, 1 + 0.6 * (n - 1)); };
ctx.crowd = crowd;
const snapNav = (v) => { const id = nav.nearestNode(v, 4, 3); if (id >= 0) { const nd = nav.nodes[id]; v.set(nd.x, nd.y + 0.05, nd.z); } return v; };
const bEvents = createBrasiliaEvents(ctx, {
  net, online, snap: snapNav, crowd,
  manifest: () => triggerBrasiliaManifestation(),
  onCrash: (pos) => { for (let i = 0; i < 2; i++) { const p = enemies.spawn(i ? 'police_tactical' : 'police', snapNav(new THREE.Vector3(pos.x + rand(-10, 10), 0, pos.z + rand(-10, 10)))); p.state = 'hunt'; } audio.siren(pos); },
});
ctx.rioterProps = () => bEvents.rioterProps(); ctx.bEvents = bEvents;
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
  if (info.source === 'bot' || info.source === 'event') return; // bot contra bot ou desastre: não conta para o jogador
  game.kills++; game.combo++; game.comboT = 3.5;
  let label = e.T.name, pts = e.T.score;
  if (info.crit) { label = 'Tiro na Cabeça'; pts += 60; }
  if (info.source === 'katana') { label = over ? 'Cortado ao Meio' : 'Fatiado'; pts += 50; }
  if (info.source === 'focus') { label = 'Execução'; pts += 150; }
  if (info.source === 'katana' || info.source === 'focus') { game.katanaStreak++; player.weapons[player.katanaIndex].addBlood(0.42); if (game.katanaStreak >= KATANA_CHARGE_KILLS) enterFocus(); }
  else if (info.source !== 'blast') game.katanaStreak = 0;
  if (info.source === 'deflect') { label = 'Rebatido'; pts += 120; }
  if (info.source === 'car') { label = 'Atropelado'; if (pts < 0) pts = 0; }
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
  brasiliaEventTimer = 75;
  ctx.protestersRiot = false;
  ctx.playerWanted = false;
  if (net.active && net.isHost) net.send('bcalm', {});

  const existingAmbient = enemies.enemies.filter((e) => e.alive && (e.T.isProtester || e.T.isPolice)).length;
  if (existingAmbient > 8) return; // Evita acúmulo excessivo de bots

  // Escolhe o foco da manifestação perto dos jogadores ativos (Torre de TV/Fonte, Rodoviária/Conjunto Nacional ou Esplanada/Congresso)
  const anchors = ctx.targets().filter((t) => t && t.alive && t.body);
  const refZ = anchors.length ? choose(anchors).body.pos.z : player.body.pos.z;
  let baseZ = 18, zoneLabel = 'NA ESPLANADA';
  if (refZ < -265) { baseZ = -272; zoneLabel = 'NA TORRE DE TV'; }
  else if (refZ < -125) { baseZ = -182; zoneLabel = 'NA RODOVIÁRIA'; }

  // Manifestantes + Líderes Manifestantes (marcham contra a polícia; não atacam jogadores se não forem provocados!)
  const protOffsets = [
    [-5, -14, 'protester'], [5, -12, 'protester'], [0, -10, 'protester_leader'],
    [-7, -4, 'protester'], [0, -3, 'protester'], [6, -2, 'protester'],
    [-3, 4, 'protester'], [4, 5, 'protester_leader'],
  ];
  for (const [dx, dz, kind] of protOffsets) {
    const p = enemies.spawn(kind, new THREE.Vector3(dx, 0.25, baseZ + dz));
    p.state = 'hunt';
  }

  // Pelotão da PMDF + GSI + Tropa de Choque (BOPE) (combatem os manifestantes; não atacam jogadores inocentes!)
  const polOffsets = [
    [-7, 34, 'police'], [0, 34, 'police_tactical'], [7, 34, 'police'],
    [-4, 39, 'police_tactical'], [4, 39, 'police'], [0, 42, 'police_chief'],
  ];
  for (const [dx, dz, kind] of polOffsets) {
    const pol = enemies.spawn(kind, new THREE.Vector3(dx, 0.25, baseZ + dz));
    pol.state = 'hunt';
  }

  audio.siren(new THREE.Vector3(0, 0, baseZ + 24));
  if (hud) {
    hud.message(`🚩 MANIFESTAÇÃO ${zoneLabel}!`, 'Confronto entre Manifestantes e PMDF! Não ataque nenhum lado ou sofrerá as consequências!', 5.0);
  }
  if (net.active && net.isHost) net.send('bmanif', { zone: zoneLabel });
}

// Trânsito de Brasília: os veículos empurram/ferem o jogador e atropelam os bots (o host decide os abates)
const _carDir = new THREE.Vector3();
function carOverlap(car, p, r, maxY) {
  if (car.hidden || p.y - car.y > maxY || p.y - car.y < -1) return false;
  const hw = car.axis === 'x' ? car.d / 2 : car.w / 2, hd = car.axis === 'x' ? car.w / 2 : car.d / 2;
  return Math.abs(p.x - car.x) < hw + r && Math.abs(p.z - car.z) < hd + r;
}
function updateTrafficHits() {
  const now = performance.now();
  for (const car of level.cars) {
    if (car.hidden) continue;
    const moving = car.speed > 1.5;
    const riding = player.grapple && player.grapple.state !== 'idle' && player.grapple.mover && player.grapple.mover.car === car;
    if (player.alive && !riding && carOverlap(car, player.body.pos, 0.55, 2.4)) {
      if (!car._hornT || now - car._hornT > 1000) { car._hornT = now; audio.horn(car.group.position); }
      if (moving && (!car._hitT || now - car._hitT > 450)) {
        car._hitT = now;
        if (car.axis === 'z') _carDir.set(player.body.pos.x > car.x ? 0.9 : -0.9, 0.35, car.dir * 0.55);
        else _carDir.set(car.dir * 0.55, 0.35, player.body.pos.z > car.z ? 0.9 : -0.9);
        player.knockback(_carDir.normalize(), car.isBus ? 13 : 9);
        const dmg = car.isBus ? 22 : 14; player.takeDamage(dmg, car.group.position);
        hud.kill((car.isBus ? 'Atropelado pelo ônibus' : 'Atropelado') + ' · -' + dmg + ' Vida', 0);
      } else if (!moving) { // parado no semáforo: só não deixa atravessar a lataria
        if (car.axis === 'z') player.body.pos.x = car.x + Math.sign(player.body.pos.x - car.x || 1) * (car.w / 2 + 0.56);
        else player.body.pos.z = car.z + Math.sign(player.body.pos.z - car.z || 1) * (car.w / 2 + 0.56);
      }
    }
    if (!moving || (online() && !net.isHost)) continue;
    for (const e of enemies.enemies) {
      if (!e.alive || e.T.flying || e.state === 'spawn') continue;
      if (!carOverlap(car, e.body.pos, e.body.halfW + 0.1, 2.6)) continue;
      if (car.axis === 'z') _carDir.set(e.body.pos.x > car.x ? 0.6 : -0.6, 0.45, car.dir); else _carDir.set(car.dir, 0.45, e.body.pos.z > car.z ? 0.6 : -0.6);
      _carDir.normalize();
      if (e.T.isPet) { e.body.pos.x += _carDir.x * 1.2; e.body.pos.z += _carDir.z * 1.2; continue; } // o Orelha sai da frente
      if (e.T.boss) { if (!e._carT || now - e._carT > 800) { e._carT = now; enemies.damage(e, 120, { source: 'car', dir: _carDir.clone(), point: e.center.clone(), part: 'torso' }); } continue; }
      enemies.damage(e, 9999, { source: 'car', dir: _carDir.clone(), point: e.center.clone(), part: 'torso' });
      if (!car._hornT || now - car._hornT > 700) { car._hornT = now; audio.horn(car.group.position); }
    }
  }
}

function spawnBrasiliaCivilians() {
  bEvents.reset();
  const civSpots = [
    ['civilian', -84, 0.3, -455],   // Estádio Mané Garrincha
    ['politician', 56, 0, -458],    // Praça do Buriti (GDF)
    ['civilian', 0, 9.5, -402],     // Terraço do Centro de Convenções Ulysses Guimarães
    ['vendor', -6, 0, -346],        // Feirinha da Torre de TV
    ['vendor', 6, 0, -342],         // Feirinha da Torre de TV
    ['civilian', 0, 20, -312],      // Mirante da Torre de TV
    ['civilian', 54, 0, -328],      // Entrada do Pátio Brasil Shopping
    ['civilian', 78, 0, -268],      // Setor Comercial Sul (SCS)
    ['civilian', -56, 0, -240],     // Calçada do Conjunto Nacional
    ['vendor', 0, 0, -213],         // Plataforma superior da Rodoviária
    ['civilian', -24, -6.2, -234],  // Embarque (piso inferior) da Rodoviária
    ['vendor', 12, -6.2, -192],     // Pastel com caldo de cana no embarque
    ['civilian', 46, 0, -140],      // Calçada do Museu Nacional
    ['civilian', 44, 0, -108],      // Entrada da Catedral
    ['civilian', 186, 0, -347],     // Comércio da W3 Sul
    ['vendor', -186, 0, -277],      // Comércio local da Asa Norte
    ['civilian', 192, 0, -296],     // Igrejinha (307 Sul)
    ['civilian', -170, 0, -246],    // Superquadra Norte
    ['civilian', -46, 0, -128],     // Teatro Nacional
    ['politician', -42, 0, -24],    // Ministério Norte
    ['politician', 42, 0, 32],      // Ministério Sul
    ['politician', 0, 5, 172],      // Rampa / Salão do Congresso Nacional
    ['politician', -36, 0, 214],    // Praça dos Três Poderes / Planalto
  ];
  // encaixa cada ponto no nó de navegação mais próximo: alguns caíam dentro de blocos e despencavam do mapa
  const snap = (v) => { const id = nav.nearestNode(v, 4, 3); if (id >= 0) { const nd = nav.nodes[id]; v.set(nd.x, nd.y + 0.05, nd.z); } return v; };
  for (const [kind, x, y, z] of civSpots) {
    const c = enemies.spawn(kind, snap(new THREE.Vector3(x, y, z)));
    c.state = 'hunt';
  }
  // Orelha: o cachorro caramelo que acompanha os jogadores pela cidade (não pode ser ferido)
  if (!enemies.enemies.some((e) => e.alive && e.T.isPet)) { const sp = level.playerStart; const o = enemies.spawn('orelha', snap(new THREE.Vector3(sp.x + 3, sp.y, sp.z + 3))); o.state = 'hunt'; }
  triggerBrasiliaManifestation();
}

ctx.onProtestersRiot = () => {
  if (net.active && net.isHost) net.send('briot', {});
};
ctx.onPlayerWanted = () => {
  if (net.active && net.isHost) net.send('bwanted', {});
};

ctx.onCivilianKilled = (civ, info) => {
  if (info && (info.source === 'bot' || info.source === 'fall' || info.source === 'car' || info.source === 'event')) return;
  ctx.playerWanted = true;
  if (ctx.onPlayerWanted) ctx.onPlayerWanted();
  audio.siren(civ.center);
  hud.message('🚨 CRIME COMETIDO!', 'A Polícia foi acionada para conter o infrator!', 3.5);
  hud.kill('🚨 Inocente Morto · Polícia Acionada!', -100);
  player.addCash(-150, 'Crime / Multa Policial');
  game.addScore(-100, 'Crime Cometido');

  // cap the riot squad: every dead civilian used to add 3 more police, without limit
  const policeAlive = enemies.enemies.filter((e) => e.alive && e.T.isPolice).length;
  if ((!online() || net.isHost) && policeAlive < 10) {
    const culprit = (info && info.by && remote.get(info.by)) || player;
    const cx = civ.body.pos.x, cz = civ.body.pos.z;
    for (let i = 0; i < 2; i++) {
      const pPos = new THREE.Vector3(cx + (i === 0 ? -6 : 6), 0, cz + (Math.random() - 0.5) * 8);
      const pBot = enemies.spawn(i === 0 ? 'police' : 'police_tactical', pPos);
      pBot.state = 'hunt';
      pBot.target = culprit;
    }
    const chiefPos = new THREE.Vector3(cx, 0, cz + (cz > 0 ? -10 : 10));
    const chief = enemies.spawn('police_chief', chiefPos);
    chief.state = 'hunt';
    chief.target = culprit;
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
  sendScores();
}
function sendScores() { const rows = [...scores.entries()].map(([id, s]) => ({ id, ...s })); net.send('score', rows); applyScores(rows); }
function applyScores(rows) {
  if (!Array.isArray(rows)) return;
  scores.clear();
  for (const r of rows.slice(0, 24)) {
    if (!r || typeof r.id !== 'string') continue;
    scores.set(r.id, {
      name: sanitizeName(r.name, 'Jogador'),
      kills: Math.round(clampNum(r.kills, 0, 99999, 0)),
      deaths: Math.round(clampNum(r.deaths, 0, 99999, 0)),
    });
  }
  refreshScoreHud();
}
function sortedScores() { return [...scores.entries()].sort((a, b) => b[1].kills - a[1].kills || a[1].deaths - b[1].deaths); }
function refreshScoreHud() {
  if (!online()) return;
  const rows = sortedScores(); const top = rows.slice(0, 3); const myIdx = rows.findIndex(([id]) => id === net.id);
  if (myIdx >= 3) top.push(rows[myIdx]);
  hud.setPvpScore(top.map(([id, sc]) => `<div class="row${id === net.id ? ' me' : ''}"><span class="rank">${rows.findIndex(([x]) => x === id) + 1}.</span><span>${esc(sc.name)}${id === net.id ? ' (Você)' : ''}</span><b>${sc.kills}</b></div>`).join('') + `<div class="target">Mata-Mata · Restam ${mmss(matchLeft)}</div>`);
  hud.setModifier('');
  if (!hud.el.board.hidden) hud.setBoard(boardHTML());
}
function boardHTML(title = 'Mata-Mata Livre') {
  const rows = sortedScores();
  const roomCode = esc(String(net.aliasCode || net.code || '').replace(/-\d+$/, ''));
  return `<h3>${esc(title)}</h3>${rows.map(([id, s]) => `<div class="${id === net.id ? 'me' : ''}"><span>${esc(s.name)}${id === net.id ? ' (Você)' : ''}</span><span>${s.kills} Kills · ${s.deaths} Mortes</span></div>`).join('')}<div class="foot">Mata-Mata até acabar o tempo · Restam ${mmss(matchLeft)} · Sala ${roomCode}</div>`;
}
function endMatch(winner) {
  const w = winner && typeof winner === 'object' ? winner : { id: '', name: 'Alguém' };
  game.over = w; game.overT = 0; game.state = 'over'; endFocus(); input.exitLock(); hud.setBoard(null);
  const wName = sanitizeName(w.name, 'Alguém');
  const title = w.id === net.id ? 'Você Venceu!' : wName + ' Venceu!';
  hud.setGameplayVisible(false); hud.showScreen(`<div class="p-head"><h1 class="${w.id === net.id ? 't-gold' : ''}">${esc(title)}</h1><h2>Resultado final</h2></div>${scoreRowsHTML()}${net.isHost ? '<div class="m-play"><button type="button" class="btn btn-yellow btn-lg" data-act="go">Voltar à sala</button></div>' : '<div class="foot-hint">Aguardando o anfitrião voltar à sala…</div>'}`);
}

// ---------------- networking ----------------
function addRemote(id, name) {
  const cleanName = sanitizeName(name, 'Jogador');
  if (remote.has(id)) { const r = remote.get(id); r.name = cleanName; return r; }
  const rp = new RemotePlayer(ctx, id, cleanName, 0, INK.PURPLE); // players are violet; bots never use it
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
    for (let tries = 0; tries < 2 && !ok; tries++) { try { await net.host({ isPublic: lobby.isPublic, isInternal: lobby.isLan, mode: lobby.mode, code }); ok = true; } catch (e) { await sleep(800); } }
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
net.on('refused', (d) => leaveOnline(sanitizeText(d && d.reason, 80)));
net.hostName = myName;
net.onPeerJoin = (from, meta) => {
  const name = sanitizeName(meta && meta.name, 'Jogador');
  if (meta && typeof meta.prev === 'string' && meta.prev !== from && !remote.has(meta.prev)) {
    const sc = scores.get(meta.prev); if (sc) { scores.delete(meta.prev); scores.set(from, sc); }
    lobby.players.delete(meta.prev); if (lobby.order) lobby.order = lobby.order.filter((id) => id !== meta.prev);
  }
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
  if (!d || !Array.isArray(d.players)) return;
  lobby.hostId = typeof d.hostId === 'string' ? d.hostId : net.hostId;
  lobby.isPublic = !!d.isPublic; lobby.code = net.code; lobby.shown = sanitizeText(d.shown || net.code, 16);
  if (d.map) {
    lobby.map = knownMap(d.map);
    if (game.state === 'lobby' && loadedKey !== lobby.map) { setLevel(lobby.map, true); player.reset(level.playerStart); }
  }
  const safePlayers = d.players.slice(0, 16).filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, name: sanitizeName(p.name, 'Jogador') }));
  lobby.order = safePlayers.map((p) => p.id); lobby.players.clear();
  for (const p of safePlayers) lobby.players.set(p.id, { name: p.name });
  for (const p of safePlayers) if (p.id !== net.id) addRemote(p.id, p.name);
  for (const id of [...remote.keys()]) if (!lobby.players.has(id)) removeRemote(id);
  if (inMatch()) { for (const p of safePlayers) if (!scores.has(p.id)) scores.set(p.id, { name: p.name, kills: 0, deaths: 0 }); refreshScoreHud(); }
  renderLobby();
});
net.on('leave', (d) => { if (!d || typeof d.id !== 'string') return; const nm = (lobby.players.get(d.id) || {}).name; removeRemote(d.id); if (inMatch()) hud.kill((nm || 'Alguém') + ' saiu da sala', 0); renderLobby(); });
net.on('start', (d) => { if (net.isHost || !d || typeof d !== 'object') return; if (d.map) lobby.map = knownMap(d.map); startMatch(!!d.late, d.spawns ? d.spawns[net.id] : d.spawn, d.map); if (Array.isArray(d.broken)) for (const id of d.broken.slice(0, 500)) { const br = level.breakables[id]; if (br) breakProp(br, null, false, true); } });
net.on('startreq', () => { if (net.isHost && game.state === 'lobby') hostStart(); });
net.on('end', (d) => endMatch(d));
net.on('backtolobby', () => { if (!net.isHost) toLobbyScreen(); });
net.on('pickup', (d) => { if (!net.isHost && d && sanitizeVec3(d.pos)) spawnPickup(d.kind, new THREE.Vector3().fromArray(sanitizeVec3(d.pos)), d.id); });
net.on('taken', (d) => { if (!d) return; const p = pickups.find((x) => x.id === d.id); if (p) removePickup(p); });
net.on('take', (d) => { if (!net.isHost || !d) return; const p = pickups.find((x) => x.id === d.id); if (p) { removePickup(p); net.send('taken', { id: d.id }); } });
net.on('ps', (d, from) => { const ps = sanitizePlayerState(d); if (!ps) return; const r = remote.get(from); if (r) { r.push(ps, performance.now() / 1000); r.lastSeen = performance.now(); } });
net.on('pdmg', (d, from) => {
  if (!d || typeof d !== 'object' || !player.alive || game.state !== 'play' || player.shieldT > 0) return;
  const amount = clampNum(d.amount, 0, 220, 0);
  if (amount <= 0) return;
  const fromPos = sanitizeVec3(d.from);
  const src = typeof d.src === 'string' && HOW[d.src] ? d.src : null;
  player.lastHitBy = from || null; // usa remetente autenticado pelo transporte, nunca d.by
  player.lastHit = { from: fromPos, crit: !!d.crit, amount, src };
  player.takeDamage(amount, fromPos ? new THREE.Vector3().fromArray(fromPos) : null);
});
net.on('espawn', (d) => { if (!net.isHost && d && typeof d.type === 'string' && sanitizeVec3(d.pos)) enemies.spawn(d.type, new THREE.Vector3().fromArray(sanitizeVec3(d.pos)), d.id); });
net.on('esnap', (arr) => { if (!net.isHost && Array.isArray(arr)) enemies.applySnapshot(arr, performance.now() / 1000); });
net.on('ekill', (d) => { if (!net.isHost && d) enemies.killMirror(d.id, d.info); });
net.on('ekillcredit', (d) => {
  if (!d || typeof d !== 'object') return;
  const pts = Math.round(clampNum(d.pts, 0, 2000, 0));
  const cash = Math.round(clampNum(d.cash, 0, 2000, 0));
  const label = sanitizeText(d.label, 48);
  game.kills++; game.addScore(pts, label); player.addCash(cash, label); audio.kill(true);
});
net.on('ewave', (d) => { if (!net.isHost && d) { const w = Math.max(1, Math.round(clampNum(d.wave, 1, 999, 1))); game.wave = w; hud.setWave(w, 0); hud.message('Onda ' + w, sanitizeText(d.name, 48) || 'Bots e Jogadores!', 2.5); audio.wave(); } });
net.on('ewaveclear', (d) => { if (!net.isHost && d) { const w = Math.max(1, Math.round(clampNum(d.wave, 1, 999, 1))); hud.message('Onda ' + w + ' Concluída', 'Prepare-se para a próxima onda!', 2.5); audio.waveClear(); player.hp = Math.min(player.maxHp, player.hp + 40); player.addCash(300 + 50 * Math.min(w, 30), 'Onda Concluída'); } });
net.on('bevent', (d) => { if (!net.isHost && level.key === 'brasilia') bEvents.onNet(d); });
net.on('bmanif', (d) => { if (!net.isHost) { const z = sanitizeText(d && d.zone, 32) || 'NA ESPLANADA'; ctx.protestersRiot = false; ctx.playerWanted = false; audio.siren(player.center); hud.message(`🚩 MANIFESTAÇÃO ${z}!`, 'Confronto entre Manifestantes e PMDF! Não ataque nenhum lado!', 4.5); } });
net.on('bcalm', () => { if (!net.isHost) { ctx.protestersRiot = false; ctx.playerWanted = false; } });
net.on('briot', () => { if (!net.isHost) { ctx.protestersRiot = true; audio.siren(player.center); hud.message('⚠️ MULTIDÃO EM FÚRIA!', 'Alguém atacou os manifestantes! A multidão partiu para cima!', 4.0); } });
net.on('bwanted', () => { if (!net.isHost) { ctx.playerWanted = true; audio.siren(player.center); hud.message('🚨 FORÇA POLICIAL ACIONADA!', 'A Polícia está revidando ataques na partida!', 3.5); } });
net.on('ehit', (d, from) => {
  if (!net.isHost || !d || typeof d !== 'object') return;
  const amount = clampNum(d.amount, 0, 500, 0);
  if (amount <= 0) return;
  const e = enemies.byId.get(d.id);
  if (!e || !e.alive) return;
  const pt = d.info && sanitizeVec3(d.info.point);
  const dr = d.info && sanitizeVec3(d.info.dir, 10);
  const info = {
    crit: !!(d.info && d.info.crit),
    part: (d.info && typeof d.info.part === 'string' && d.info.part.slice(0, 16)) || 'torso',
    source: 'remote_bullet',
    point: pt ? new THREE.Vector3().fromArray(pt) : e.center.clone(),
    dir: dr ? new THREE.Vector3().fromArray(dr) : new THREE.Vector3(0, 1, 0),
    by: from
  };
  enemies.damage(e, amount, info);
  if (!e.alive) {
    const sc = scores.get(from);
    const kname = sc ? sc.name : 'Jogador';
    net.sendTo(from, 'ekillcredit', { pts: e.T.score, cash: 125 + (info.crit ? 75 : 0), label: e.T.name });
    net.send('feed', { text: kname + ' eliminou ' + e.T.name + (info.crit ? ' (Tiro na Cabeça)' : '') });
  }
});

net.on('pdead', (d, from) => {
  if (!d || typeof d !== 'object') return;
  const r = remote.get(from); const vn = r ? r.name : 'Alguém'; const kn = d.killer && scores.get(d.killer) ? scores.get(d.killer).name : null;
  const dir = sanitizeVec3(d.dir, 10);
  if (r) { r.ragdoll(dir ? new THREE.Vector3().fromArray(dir) : null, !!d.over); audio.enemyDie(r.center); }
  const safeHow = sanitizeText(d.how, 28);
  const how = safeHow ? ' · ' + safeHow + (d.crit ? ' Tiro na Cabeça' : '') : '';
  if (d.killer === net.id) { game.kills++; game.addScore(150, 'Eliminou ' + vn + how); player.addCash(300, 'Eliminação PvP'); audio.kill(true); }
  else hud.kill(kn ? kn + ' eliminou ' + vn + how : vn + ' caiu da página', 0);
  if (net.isHost) tallyDeath(from, typeof d.killer === 'string' ? d.killer : null);
});
net.on('nade', (d) => { if (d && sanitizeVec3(d.pos) && sanitizeVec3(d.vel, 200)) player.throwGrenade(d); });
net.on('rocket', (d) => { if (d && sanitizeVec3(d.pos) && sanitizeVec3(d.vel, 400)) player.fireRocket(d); });
net.on('brk', (d) => { if (!d) return; const br = level.breakables[d.id]; if (br) breakProp(br, null, false); });
net.on('parry', (d) => { if (!d) return; audio.shieldHit(player.center); input.rumble(0.35, 0.3, 60); effects.strokeBurst(player.eye.clone().addScaledVector(player.forward, 0.5), INK.ORANGE, 8, 5, { life: 0.2, size: 0.03 }); hud.kill(d.ret ? 'Rebatido' : 'Desviado', d.ret ? 25 : 0); });
net.on('shots', (d, from) => {
  if (!d || typeof d !== 'object') return;
  const r = remote.get(from); if (!r || !r.root || !r.alive) return;
  _sm.set(r.body.pos.x + r.right.x * 0.3 + r.forward.x * 0.8, r.body.pos.y + 1.35 + r.forward.y * 0.8, r.body.pos.z + r.right.z * 0.3 + r.forward.z * 0.8);
  const th = TRACER_THICK[d.k] || 0.02; const e = sanitizeShots(d.e, 36);
  for (let i = 0; i + 2 < e.length; i += 3) { _se.set(e[i], e[i + 1], e[i + 2]); effects.tracer(_sm, _se, INK.BLUE, th, 0.06); }
  r.flash(); audio.remoteShot(d.k, _sm);
});
net.on('cut', () => { if (player.grapple.state !== 'idle') { player.detachGrapple(false); effects.strokeBurst(player.center, INK.ORANGE, 8, 4, { life: 0.25, size: 0.03 }); hud.tip('Sua corda foi cortada!', 1.3); input.rumble(0.5, 0.3, 80); } });
net.on('score', (rows) => { if (!net.isHost) applyScores(rows); });
net.on('fell', (_d, from) => { if (!net.isHost) return; const sc = scores.get(from); if (sc) { sc.kills = Math.max(0, sc.kills - 1); sendScores(); net.send('feed', { text: sc.name + ' caiu da página · -1' }); hud.kill(sc.name + ' caiu da página · -1', 0); } });
net.on('feed', (d) => hud.kill(sanitizeText(d && d.text, 96), 0));
player.onFall = () => {
  if (!online() || !inMatch()) return;
  hud.kill('Caiu da página · -1 eliminação', 0);
  if (net.isHost) { const sc = scores.get(net.id); if (sc) { sc.kills = Math.max(0, sc.kills - 1); sendScores(); net.send('feed', { text: sc.name + ' caiu da página · -1' }); } }
  else net.send('fell', {});
};
net.on('clock', (d) => { if (!net.isHost && d) { matchLeft = clampNum(d.left, 0, FFA_TIME * 2, matchLeft); clockRunning = !!d.on; refreshScoreHud(); } });

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
net.on('kick', (d) => { const back = sanitizeText(String(net.aliasCode || net.code || '').replace(/-\d+$/, ''), 16); leaveOnline(sanitizeText(d && d.reason, 80) || 'Desconectado da sala'); lobby.rejoinCode = back; if (back) showStart(); });
let syncTick = 0, esnapT = 0, psT = 0;
function netUpdate(dt) {
  idleUpdate(dt);
  if (!net.active) return; const now = performance.now() / 1000; syncTick++;
  // send rates are tied to time, not frames: at 144 fps the frame-based rate tripled the traffic
  esnapT -= dt; psT -= dt;
  if (net.isHost && inMatch() && esnapT <= 0) { esnapT = 1 / 15;
    net.send('esnap', enemies.snapshot());
  }
  for (const r of remote.values()) r.update(dt, now);
  // a connection that died without saying so leaves a figure standing around: drop anyone silent too long
  if (inMatch() && !migrating) for (const [id, r] of remote) { if (r.lastSeen && performance.now() - r.lastSeen > 9000) { if (!net.isHost && id === net.hostId) { net.leave(); migrateHost(); break; } const nm = r.name; removeRemote(id); hud.kill(nm + ' desconectou', 0); if (net.isHost) { const c = net.conns.get(id); if (c) { try { c.close(); } catch (e) { /* ignore */ } net.conns.delete(id); } net.send('leave', { id }); broadcastLobby(); sendScores(); } } }
  const sendPs = psT <= 0 && inMatch(); if (sendPs) psT = 1 / 20;
  if (sendPs) net.send('ps', encodeLocal(player, player.weaponIndex, { firing: player.firing, idle: input.idleSeconds > IDLE_FLAG }), true);
  if (shotQueue.length) net.broadcast('shots', { k: player.weapon.kind, e: shotQueue.splice(0) });
  if (net.isHost && inMatch()) game.clockStarted = true;
  const clockOn = inMatch() && !game.over && (net.isHost ? !!game.clockStarted : clockRunning);
  if (inMatch() && !game.over) {
    if (clockOn) matchLeft = Math.max(0, matchLeft - dt);
    if (net.isHost) { clockT -= dt; if (clockT <= 0) { clockT = 1; net.send('clock', { left: Math.round(matchLeft), on: clockOn }); refreshScoreHud(); } }
    hud.setTimer(mmss(matchLeft));
  }
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
  lobby.isPublic = isPublic; lobby.isLan = isLan; lobby.mode = mode; lobby.map = knownMap(mapKey);
  setLevel(lobby.map, true); player.reset(level.playerStart);
  lobby.players.clear(); lobby.players.set(net.id, { name: myName }); lobby.hostId = net.id; lobby.status = '';
  game.state = 'lobby'; screen = 'lobby'; showStart();
}
async function joinLobby(code, forceLan = false) {
  setStatus('Conectando…');
  try { await net.join(code, { name: myName, isInternal: forceLan, mode: forceLan ? 'lan' : undefined }); }
  catch (err) { setStatus(friendlyError(err)); unlockButtons(); return; }
  lobby.isPublic = net.isPublic; lobby.isLan = net.isInternal; lobby.status = ''; game.state = 'lobby'; screen = 'lobby'; showStart();
}
async function quickPlay() {
  try {
    await net.quickJoin({ name: myName }, setStatus);
    lobby.isPublic = true; lobby.isLan = net.isInternal; lobby.mode = 'public'; lobby.status = '';
    if (net.isHost) {
      lobby.map = knownMap(mapKey);
      setLevel(lobby.map, true); player.reset(level.playerStart);
      lobby.players.clear(); lobby.players.set(net.id, { name: myName }); lobby.hostId = net.id;
    }
    game.state = 'lobby'; screen = 'lobby'; showStart(); return;
  }
  catch (err) { if (!/no open public/.test(String(err.message))) { setStatus(friendlyError(err)); unlockButtons(); return; } }
  setStatus('Nenhuma sala aberta · Criando nova sala pública…');
  await createLobby('public');
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
    <div class="settings-section-title">Gráficos</div>
    <div class="settings-grid">
      <label class="settings-row">Qualidade Gráfica
        <select id="setGfxQ">
          <option value="high" ${hudPrefs.gfxQuality === 'high' ? 'selected' : ''}>Alta · Ultra Nítido HD</option>
          <option value="medium" ${hudPrefs.gfxQuality === 'medium' ? 'selected' : ''}>Equilibrada · Nativo HD</option>
          <option value="low" ${hudPrefs.gfxQuality === 'low' ? 'selected' : ''}>Desempenho · FPS Máximo</option>
        </select>
      </label>
      <label class="settings-row">Estilo Visual
        <select id="setVisualStyle">
          <option value="hd" ${!hudPrefs.notebookMode ? 'selected' : ''}>Colorido Cel-Shaded HD</option>
          <option value="notebook" ${hudPrefs.notebookMode ? 'selected' : ''}>Caderno Clássico</option>
        </select>
      </label>
    </div>

    <div class="settings-section-title">Controles e som</div>
    <div class="settings-grid">
      <label class="settings-row">Sensibilidade do Mouse <input type="range" id="setSens" min="25" max="250" step="5" value="${settings.sens}"><b id="setSensV">${settings.sens}%</b></label>
      <label class="settings-row"><input type="checkbox" id="setInv" ${settings.invert ? 'checked' : ''}> Inverter Eixo Y</label>
      <label class="settings-row"><input type="checkbox" id="setFps" ${localStorage.getItem('fatal_fps') === '1' ? 'checked' : ''}> Mostrar FPS</label>
      <label class="settings-row"><input type="checkbox" id="setMap" ${minimap && minimap.enabled ? 'checked' : ''}> Minimapa</label>
      <label class="settings-row"><input type="checkbox" id="setMus" ${musicWanted ? 'checked' : ''}> Música de Fundo <span class="k">(M)</span></label>
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

// ---- Auto-Update (Electron + GitHub Releases, modelo Concord) ----
let appVersion = '1.3.0';
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

function wireSettings() {
  const box = hud.el.panel.querySelector('#settings'); if (!box) return;
  box.addEventListener('click', (e) => e.stopPropagation()); box.addEventListener('keydown', (e) => e.stopPropagation());
  const sens = box.querySelector('#setSens'), out = box.querySelector('#setSensV');
  sens.addEventListener('input', () => { settings.sens = Number(sens.value); out.textContent = settings.sens + '%'; applySettings(); });
  box.querySelector('#setInv').addEventListener('change', (e) => { settings.invert = e.target.checked; applySettings(); });
  box.querySelector('#setFps').addEventListener('change', (e) => { perf.show = e.target.checked; try { localStorage.setItem('fatal_fps', perf.show ? '1' : '0'); } catch (err) { /* ignore */ } });
  box.querySelector('#setMap').addEventListener('change', (e) => { if (minimap) minimap.setEnabled(e.target.checked); });
  box.querySelector('#setMus').addEventListener('change', (e) => { musicWanted = e.target.checked; localStorage.setItem('fatal_music', musicWanted ? '1' : '0'); audio.musicOn(musicWanted); });

  const gfxQ = box.querySelector('#setGfxQ');
  if (gfxQ) gfxQ.addEventListener('change', (e) => { hudPrefs.gfxQuality = e.target.value; applyHudSettings(); });
  const visSt = box.querySelector('#setVisualStyle');
  if (visSt) visSt.addEventListener('change', (e) => { hudPrefs.notebookMode = e.target.value === 'notebook'; applyHudSettings(); });

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
  const chkUpd = box.querySelector('#checkUpdBtn');
  if (chkUpd && window.FE_UPDATE) {
    chkUpd.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (updStatus.state === 'ready') {
        await window.FE_UPDATE.install();
        return;
      }
      chkUpd.disabled = true;
      await window.FE_UPDATE.check();
      chkUpd.disabled = false;
      const lbl = box.querySelector('#updSettingsLabel');
      if (lbl) lbl.textContent = updateSettingsText();
    });
  }
}
function wireName(box) {
  const nb = box.querySelector('#setName'); if (!nb) return;
  nb.addEventListener('input', (e) => { myName = sanitizeName(e.target.value, myName); localStorage.setItem('fatal_name', myName); player.name = myName; net.hostName = myName; });
}
const mapName = (k) => (LEVELS.find((m) => m.key === k) || LEVELS[0]).name;
function mapHTML(sel, canPick) { if (LEVELS.length < 2) return ''; return `<div class="mapsel" id="mapsel">${LEVELS.map((m) => `<button type="button" class="mapbtn${m.key === sel ? ' on' : ''}" data-map="${m.key}" ${canPick ? '' : 'disabled'}><span class="mn">${m.name}</span><span class="mb">${m.blurb}</span></button>`).join('')}</div>`; }
function wireMap(onPick) { const box = hud.el.panel.querySelector('#mapsel'); if (!box) return; box.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('.mapbtn'); if (b && !b.disabled) onPick(b.dataset.map); }); }

// ---- menus: one header, the main actions as big buttons, and everything else in tabs so the panel
// never has to scroll through maps, controls and settings at once (the open tab is remembered)
const uiTab = { main: 'maps', pause: 'controls', mpause: 'board' };
function tabsHTML(group, tabs) {
  const cur = tabs.some((t) => t[0] === uiTab[group]) ? uiTab[group] : tabs[0][0];
  return `<div class="tabs" data-group="${group}">${tabs.map(([k, label]) => `<button type="button" class="tab${k === cur ? ' on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
    <div class="tabpanes">${tabs.map(([k, , html]) => `<div class="pane${k === cur ? ' on' : ''}" data-pane="${k}">${html}</div>`).join('')}</div>`;
}
function wireTabs() {
  for (const t of hud.el.panel.querySelectorAll('.tabs')) t.addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return; e.stopPropagation(); uiTab[t.dataset.group] = b.dataset.tab;
    for (const x of t.querySelectorAll('.tab')) x.classList.toggle('on', x === b);
    for (const x of t.nextElementSibling.children) x.classList.toggle('on', x.dataset.pane === b.dataset.tab);
  });
}
const scoreRowsHTML = () => `<div class="scoreboard">${sortedScores().map(([id, s], i) => `<div class="${id === net.id ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(s.name)}${id === net.id ? ' (você)' : ''}</span><span class="kd"><b>${s.kills}</b> abates · ${s.deaths} mortes</span></div>`).join('')}</div>`;
function mainHTML() {
  return `<div class="m-head"><div class="logo"><span class="l1">FATAL</span><span class="l2">ERROR</span></div><div class="tagline">Tiro arcade e sobrevivência num mundo rabiscado</div></div>
    ${updateBannerHTML()}
    <div class="m-play">
      <button type="button" class="btn btn-yellow btn-xl" id="soloBtn"><span class="bt">▶ Jogar Solo</span><span class="bs">Sobreviva a ondas de inimigos</span></button>
      <button type="button" class="btn btn-blue btn-xl" id="onlineBtn"><span class="bt">Jogar Online</span><span class="bs">Mata-mata · até 10 jogadores</span></button>
    </div>
    <div class="m-info"><span class="chip">Mapa: <b>${esc(mapName(mapKey))}</b></span><span class="chip">Versão <b>v${esc(appVersion)}</b></span>${best ? `<span class="chip chip-gold">Recorde: <b>${best}</b></span>` : ''}</div>
    ${tabsHTML('main', [['maps', 'Mapas', mapHTML(mapKey, true)], ['controls', 'Controles', CONTROLS_HTML], ['settings', 'Ajustes', settingsHTML()]])}`;
}
function onlineHTML() {
  return `<h1>Jogar Online</h1><h2>Mata-Mata Livre · Até o tempo acabar (${Math.round(FFA_TIME / 60)} min) + Bots · Até 10 jogadores</h2>
    ${updateBannerHTML()}
    <div class="online" id="online">
      <div class="row"><span>Seu Apelido</span><input type="text" class="namebox" id="setName" maxlength="14" placeholder="Seu apelido" value="${esc(myName)}"></div>
      <div class="row"><button type="button" class="big" id="quickBtn">Partida Rápida</button><span class="hint">Entra em qualquer sala aberta ou cria uma nova</span></div>
      <div class="row split"><span>ou</span></div>
      <div class="row"><button type="button" id="createBtn">Criar Sala</button><div class="radio" style="display:flex; flex-wrap:wrap; gap:10px;"><label><input type="radio" name="vis" value="public" ${lobby.mode === 'public' || (!lobby.mode && lobby.isPublic) ? 'checked' : ''}> 🌐 Pública (Global)</label><label><input type="radio" name="vis" value="private" ${lobby.mode === 'private' || (!lobby.mode && !lobby.isPublic && !lobby.isLan) ? 'checked' : ''}> 🔒 Privada (Global)</label><label style="color:#0077aa; font-weight:bold;"><input type="radio" name="vis" value="lan" ${lobby.mode === 'lan' || lobby.isLan ? 'checked' : ''}> 🏢 Sala Interna (GDFNet / Mesma Rede)</label></div></div>
      <div class="row"><span>Tem o código da sala?</span><input type="text" id="codeBox" placeholder="CÓDIGO OU IP" maxlength="22" autocomplete="off"><label style="font-size:16px; margin:0 4px;"><input type="checkbox" id="joinLanCheck"> Forçar GDFNet</label><button type="button" id="joinBtn">Entrar</button></div>
      <div class="lobbylist" id="lobbylist"><div class="row"><span>Salas Abertas</span><button type="button" class="alt" id="refreshBtn">Atualizar</button></div><div class="rows" id="lobbyRows">${lobbyListHTML()}</div></div>
      <div class="status" id="status">${esc(lobby.status || '')}</div>
      ${lobby.rejoinCode ? `<div class="row"><button type="button" class="big" id="rejoinBtn">Reconectar a ${esc(lobby.rejoinCode)}</button></div>` : ''}
      <div class="row"><button type="button" class="alt" id="backBtn">Voltar</button></div>
    </div>`;
}
function lobbyHTML() {
  const rows = lobbyRows(); const host = net.isHost; const n = rows.length;
  const shownCode = esc(String(net.isHost ? (net.aliasCode || net.code) : (lobby.shown || net.code) || '').replace(/-\d+$/, ''));
  const isGdf = !!(net.isInternal || lobby.isLan);
  const directIp = isGdf && net.lanAddress ? `<span style="margin-left:10px; font-size:16px; color:#1f2937;">IP Direto: <b style="user-select:text;">${esc(net.lanAddress)}</b></span>` : '';
  const hintText = isGdf
    ? 'Sala GDFNet: seus colegas podem clicar em "Salas Abertas" ou digitar o Código / IP Direto acima'
    : (lobby.isPublic ? 'Sala pública: qualquer um na rede ou com o código pode entrar' : 'Sala privada: passe este código para seus colegas entrarem');
  return `<h1>Sala de Espera</h1><h2>Mata-Mata Livre · Até acabar o tempo (${Math.round(FFA_TIME / 60)} min) + Bots · ${n}/${net.maxPlayers} jogadores</h2>
    ${updateBannerHTML()}
    <div class="online" id="online">
      <div class="row"><span>Código</span><span class="code" style="user-select:text;">${shownCode}</span> ${isGdf ? '<b style="color:#0077aa; font-size:20px; margin-left:8px;">[Rede Interna GDFNet]</b>' : ''}${directIp}</div>
      ${mapHTML(lobby.map || mapKey, host)}
      <div class="hint">${hintText}</div>
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
  return lobbyList.map((l) => `<div class="lobbyrow"><span class="code">${esc(l.code)}</span><span>${esc(l.hostName || 'Alguém')}${l.isLan ? ' <b style="color:#0077aa;">[GDFNet]</b>' : ' - Sala'}</span><span>${l.players}/${l.max}${l.inMatch ? ' · Em partida' : ''}</span>${l.full ? '<span class="status">Lotada</span>' : `<button type="button" data-join="${esc(l.code)}" data-lan="${l.isLan ? '1' : '0'}">Entrar</button>`}</div>`).join('');
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
  if (q('lobbyRows')) q('lobbyRows').addEventListener('click', (e) => { const b = e.target.closest('button[data-join]'); if (b) { lockButtons(box); joinLobby(b.dataset.join, b.dataset.lan === '1'); } });
  wireMap((k) => {
    if (net.isHost) {
      lobby.map = knownMap(k);
      mapKey = lobby.map;
      localStorage.setItem('fatal_map', lobby.map);
      setLevel(lobby.map, true);
      player.reset(level.playerStart);
      broadcastLobby();
    }
  });
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
  wireUpdateBanner();
  const p = hud.el.panel;
  if (screen === 'main') {
    wireSettings();
    wireMap((k) => { mapKey = knownMap(k); lobby.map = mapKey; localStorage.setItem('fatal_map', mapKey); setLevel(mapKey, false); player.reset(level.playerStart); showStart(); });
    p.querySelector('#soloBtn').addEventListener('click', (e) => { e.stopPropagation(); begin(); });
    p.querySelector('#onlineBtn').addEventListener('click', (e) => { e.stopPropagation(); screen = 'online'; showStart(); });
    wireTabs();
  } else wireOnline();
}
function showPause() {
  const resumeHint = `<div class="foot-hint"><kbd>${hud.key('pause')}</kbd> ou <kbd>${hud.key('confirm')}</kbd> para continuar</div>`;
  if (online()) {
    const pauseCode = esc(String(net.aliasCode || net.code || '').replace(/-\d+$/, ''));
    hud.showScreen(`<div class="p-head"><h1>Menu</h1><div class="m-info"><span class="chip">Mata-mata livre</span><span class="chip">Sala <b>${pauseCode}</b></span></div></div>
      <div class="m-play" id="online"><button type="button" class="btn btn-yellow btn-lg" data-act="go">▶ Continuar</button><button type="button" class="btn btn-red btn-lg" id="leaveBtn">Sair da partida</button></div>
      ${tabsHTML('mpause', [['board', 'Placar', scoreRowsHTML()], ['controls', 'Controles', CONTROLS_HTML], ['settings', 'Ajustes', settingsHTML()]])}${resumeHint}`);
    wireSettings(); wireOnline(); wireTabs(); return;
  }
  hud.showScreen(`<div class="p-head"><h1>Pausado</h1><div class="m-info"><span class="chip">Onda <b>${game.wave}</b></span><span class="chip">Pontos <b>${game.score}</b></span></div></div>
    <div class="m-play"><button type="button" class="btn btn-yellow btn-lg" data-act="go">▶ Continuar</button><button type="button" class="btn btn-white btn-lg" id="menuBtn">Menu principal</button></div>
    ${tabsHTML('pause', [['controls', 'Controles', CONTROLS_HTML], ['settings', 'Ajustes', settingsHTML()]])}${resumeHint}`);
  wireSettings(); wireMenuBtn(); wireTabs();
}
function showClickToPlay() { hud.showScreen(`<div class="p-head"><h1>Partida iniciada</h1><h2>Mata-mata livre · ${Math.round(FFA_TIME / 60)} min · com bots</h2></div><div class="m-play"><button type="button" class="btn btn-yellow btn-xl" data-act="go"><span class="bt">Lutar!</span></button></div><div class="foot-hint"><kbd>${hud.key('confirm')}</kbd> para começar</div>`); }
function showDead() {
  hud.setGameplayVisible(false); const nb = game.score > best; if (nb) { best = game.score; localStorage.setItem('fatal_best', String(best)); }
  hud.showScreen(`<div class="p-head"><h1 class="t-red">Você foi apagado!</h1></div>
    <div class="statgrid"><div><b>${game.wave}</b><span>ondas</span></div><div><b>${game.kills}</b><span>eliminações</span></div><div><b>${game.score}</b><span>pontos</span></div></div>
    <div class="m-info">${nb ? '<span class="chip chip-gold">Novo recorde!</span>' : `<span class="chip">Recorde: <b>${best}</b></span>`}</div>
    <div class="m-play"><button type="button" class="btn btn-yellow btn-lg" data-act="go">↻ Jogar de novo</button><button type="button" class="btn btn-white btn-lg" id="menuBtn">Menu principal</button></div>
    <div class="foot-hint"><kbd>${hud.key('confirm')}</kbd> para recomeçar da onda 1</div>`);
  wireMenuBtn();
}
function menuBtnHTML() { return '<div class="online menubtn"><div class="row"><button type="button" class="alt" id="menuBtn">Menu Principal</button></div></div>'; }
function wireMenuBtn() { const b = hud.el.panel.querySelector('#menuBtn'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); toMainMenu(); }); }
function toMainMenu() { game.state = 'start'; game.mode = 'solo'; game.menu = false; setArena(false); resetGame(); audio.reelLoop(false); input.exitLock(); hud.setGameplayVisible(false); screen = 'main'; showStart(); }
function toLobbyScreen() { net.inMatch = false; for (const r of remote.values()) r.lastSeen = performance.now(); setArena(true); resetGame(); game.state = 'lobby'; game.over = null; game.menu = false; hud.setGameplayVisible(false); hud.setBoard(null); screen = 'lobby'; showStart(); }

// ---------------- run control ----------------
function resetGame() {
  if (level.breakables.some((b) => !b.alive)) setLevel(loadedKey, arenaLoaded, true);
  enemies.clear(); effects.clear(); survival.clearPickups();
  ctx.protestersRiot = false; ctx.playerWanted = false;
  player.maxHp = online() ? 110 : 120; player.regenDelay = online() ? 4 : 4.5; player.regenRate = online() ? 14 : 11;
  player.reset(level.playerStart); player.name = myName; player.lastHitBy = null; player.lastHit = null; enemies.mods.speed = 1; enemies.mods.damage = 1; hud.setModifier(''); hud.setBoss(null, null); game.boss = null; endFocus(); game.katanaStreak = 0;
  game.score = 0; game.kills = 0; game.combo = 0; game.wave = 0; game.intermission = 0; game.queue = []; game.time = 0; game.over = null; game.matchT = 0; hud.setScore(0, 0); hud.setTimer(''); hud.setPvpScore(null); hud.setWave(1, 0); hud.setBoard(null);
}
function beginCommon() { audio.init(); audio.resume(); if (!input.usingGamepad) input.requestLock(); if (musicWanted && !audio.musicPlaying) audio.musicOn(true); hud.hideScreen(); hud.setGameplayVisible(true); game.menu = false; }
function begin() {
  game.mode = 'solo'; setArena(false); beginCommon();
  if (game.state === 'start' || game.state === 'dead') {
    resetGame();
    if (level.key === 'brasilia') spawnBrasiliaCivilians();
    startWave(1);
  }
  game.state = 'play';
}
function beginAtWave(n) {
  game.mode = 'solo'; setArena(false); beginCommon(); resetGame();
  if (level.key === 'brasilia') spawnBrasiliaCivilians();
  startWave(n); game.state = 'play';
}
function jumpToWave(n) { enemies.clear(); effects.clear(); enemies.mods.speed = 1; enemies.mods.damage = 1; endFocus(); game.intermission = 0; game.queue = []; startWave(n); hud.hideScreen(); hud.setGameplayVisible(true); game.state = 'play'; game.menu = false; audio.reelLoop(false); }
function hostStart() {
  scores.clear(); for (const [id, p] of lobby.players) scores.set(id, { name: p.name, kills: 0, deaths: 0 });
  // preserve the exact map selected by the host in the main menu or lobby
  lobby.map = knownMap(lobby.map || mapKey);
  setLevel(lobby.map, true);
  // deal everyone a different spot, shuffled so the same people do not always start together
  const order = spawnSpots().map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const spawns = {}; [...lobby.players.keys()].forEach((id, i) => { spawns[id] = order[i % order.length]; });
  net.send('start', { spawns, map: lobby.map }); startMatch(false, spawns[net.id], lobby.map); sendScores();
}
function startMatch(late, spawnIdx, forcedMap) {
  if (forcedMap) lobby.map = knownMap(forcedMap);
  const chosenMap = knownMap(lobby.map || mapKey);
  lobby.map = chosenMap;
  net.inMatch = true; game.mode = 'ffa'; enemies.mirror = !net.isHost;
  setLevel(chosenMap, true); resetGame(); matchLeft = FFA_TIME; clockT = 0; game.clockStarted = true; clockRunning = true;
  // nobody sends snapshots in the lobby, so the silence clock restarts here or the sweep would drop everyone
  for (const r of remote.values()) r.lastSeen = performance.now();
  if (!scores.size) for (const [id, p] of lobby.players) scores.set(id, { name: p.name, kills: 0, deaths: 0 });
  const spots = spawnSpots(); player.reset(spawnIdx != null && spots[spawnIdx] ? spots[spawnIdx].clone() : arenaSpawn()); beginCommon(); game.state = 'play'; screen = 'lobby'; player.shieldT = 2;
  if (net.isHost) {
    if (level.key === 'brasilia') spawnBrasiliaCivilians();
    startWave(1);
  }
  refreshScoreHud(); hud.message('Mata-Mata Livre', late ? 'Você entrou em uma partida em andamento' : 'Mata-Mata até acabar o tempo (' + Math.round(FFA_TIME / 60) + ' min) · Junto com os Bots!', 3);
  hud.tip(`Segure <b>${hud.key('score')}</b> para ver o placar`, 5);
  // a match started by someone else's click cannot grab the mouse: ask for a click
  setTimeout(() => { if (game.state === 'play' && !input.pointerLocked && !input.usingGamepad) { game.menu = true; showClickToPlay(); } }, 250);
}
function pause() { if ((game.state !== 'play' && !(game.state === 'dying' && online())) || game.menu) return; if (!online()) game.state = 'pause'; game.menu = true; showPause(); audio.reelLoop(false); }
function resume() { if (online()) { game.menu = false; if (game.state === 'dying' && game.respawnT <= 0) game.respawnArm = input.lastActive; hud.hideScreen(); hud.setGameplayVisible(true); if (!input.usingGamepad) input.requestLock(); return; } begin(); }
Object.assign(window.__game, { bEvents, startWave, updateWaves, begin, beginAtWave, jumpToWave, resetGame, spawnPickup, focusCandidate, enterFocus, pickSpawn, startMatch, createLobby, joinLobby, quickPlay, leaveOnline, hostStart });
hud.onScreenClick = (src) => {
  const st = game.state;
  if (st === 'over') { if (net.isHost) { net.send('backtolobby', {}); toLobbyScreen(); } return; }
  if (st === 'lobby') return;
  if (st === 'start') { if (screen === 'main' && src !== 'backdrop') begin(); return; }
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
function tick(now) { requestAnimationFrame(tick); perfFrame(now); const t0 = performance.now(); step(now); perf.js += performance.now() - t0; perf.jsN++; }
// ---- performance meter: an on-screen FPS readout (Settings > Mostrar FPS) and, in the desktop
// build, a line in fatal-error.log every 15 s of play with real frame times from this machine
const perf = { last: 0, times: [], logT: 0, show: localStorage.getItem('fatal_fps') === '1', el: null, uiT: 0, js: 0, jsN: 0, rnd: 0 };
{ const r0 = R.render.bind(R); R.render = (...a) => { const t = performance.now(); r0(...a); perf.rnd += performance.now() - t; }; }
function perfFrame(now) {
  const ms = perf.last ? now - perf.last : 16.7; perf.last = now; if (ms > 1000) return;
  perf.times.push(ms); if (perf.times.length > 1200) perf.times.splice(0, perf.times.length - 1200);
  const playing = game.state === 'play';
  if (perf.show) {
    if (!perf.el) { perf.el = document.createElement('div'); perf.el.className = 'fpsmeter'; hud.root.appendChild(perf.el); }
    perf.uiT -= ms; if (perf.uiT <= 0) { perf.uiT = 500; const n = Math.min(60, perf.times.length), recent = perf.times.slice(-n); const avg = recent.reduce((a, b) => a + b, 0) / n;
      perf.el.textContent = Math.round(1000 / avg) + ' FPS · ' + Math.max(...recent).toFixed(0) + ' ms pior'; perf.el.hidden = false; }
  } else if (perf.el) perf.el.hidden = true;
  perf.logT += ms;
  if (playing && perf.logT > 15000 && window.FE_LOG && window.FE_LOG.info) {
    perf.logT = 0; const t = perf.times.slice(-900).sort((a, b) => a - b); const avg = t.reduce((a, b) => a + b, 0) / t.length;
    const info = R.renderer.info.render;
    const jsMs = perf.jsN ? perf.js / perf.jsN : 0, rMs = perf.jsN ? perf.rnd / perf.jsN : 0; perf.js = 0; perf.rnd = 0; perf.jsN = 0;
    // cpu = whole JS frame (logic + draw submission), render = draw submission part; if cpu is far below the
    // frame time, the limit is the GPU / presentation (vsync), not the game code
    window.FE_LOG.info(`perf map=${level.key} cpu=${jsMs.toFixed(1)}ms render=${rMs.toFixed(1)}ms fps=${(1000 / avg).toFixed(1)} p50=${t[Math.floor(t.length * 0.5)].toFixed(1)}ms p95=${t[Math.floor(t.length * 0.95)].toFixed(1)}ms pior=${t[t.length - 1].toFixed(0)}ms bots=${enemies.alive} calls=${info.calls} tri=${info.triangles} ratio=${R.pixelRatio} tela=${innerWidth}x${innerHeight}`);
  }
}
{ // which GPU WebGL is really drawing on (software rendering here would explain everything)
  try { const gl = R.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (window.FE_LOG && window.FE_LOG.info) window.FE_LOG.info('webgl ' + gpu + ' | dpr=' + devicePixelRatio + ' ratio=' + R.pixelRatio);
  } catch (e) { /* ignore */ }
}
// browsers starve animation frames in hidden tabs; a host that alt-tabs would freeze everyone's
// match, so a coarse timer runs extra steps (never extra frame chains) while that happens
setInterval(() => { if (net.active && performance.now() - last > 300) step(performance.now()); }, 250);
// One bad frame must never freeze the match: errors are logged (to the app's log file in the
// desktop build) and, when a bot's update throws, that bot is dropped so the next frame is clean.
let errCount = 0, errLastMsg = '';
function reportError(where, err) {
  errCount++; const msg = where + ': ' + (err && err.stack || err);
  if (msg !== errLastMsg || errCount % 100 === 0) { console.error(msg); if (window.FE_LOG) window.FE_LOG.error(msg.slice(0, 2000)); }
  errLastMsg = msg;
}
window.addEventListener('error', (ev) => reportError('window', ev.error || ev.message));
window.addEventListener('unhandledrejection', (ev) => reportError('promise', ev.reason));
function safeEnemies(sdt) {
  try { enemies.update(sdt); }
  catch (err) {
    reportError('enemies', err); const bad = enemies._cur; enemies._cur = null;
    if (bad) { const i = enemies.enemies.indexOf(bad); if (i >= 0) { if (bad.alive) enemies.alive--; bad.alive = false; if (!bad.rootDetached && bad.root) ctx.scene.remove(bad.root); enemies.byId.delete(bad.id); enemies.enemies.splice(i, 1); } }
  }
}
function step(now) {
  try { stepInner(now); } catch (err) { reportError('step', err); }
}
let lastWall = 0, lastMatchActiveSent = null;
function stepInner(now) {
  // after this machine itself stalled (minimised window, map load, a hitch), everyone looks "silent"
  // only because we were not reading: give remotes a fresh grace period instead of dropping them all
  { const wall = performance.now(); if (lastWall && wall - lastWall > 1500) for (const r of remote.values()) if (r.lastSeen) r.lastSeen = wall; lastWall = wall; }
  // never more than 50 ms a step: a bigger jump (a tab coming back) makes the springs in the view model fly apart
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  input.update(dt);
  const st = game.state; const playing = st === 'play' || st === 'dying';
  const matchBusy = playing || st === 'pause' || st === 'over';
  if (matchBusy !== lastMatchActiveSent) {
    lastMatchActiveSent = matchBusy;
    if (window.FE_UPDATE && window.FE_UPDATE.setMatchActive) window.FE_UPDATE.setMatchActive(matchBusy);
  }
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
  if (input.pressed('music')) { musicWanted = !musicWanted; localStorage.setItem('fatal_music', musicWanted ? '1' : '0'); audio.musicOn(musicWanted); hud.tip(musicWanted ? 'Música Ligada' : 'Música Desligada', 1.5); }
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
    if (level.cars && playing) updateTrafficHits();
    player.update(sdt); safeEnemies(sdt); effects.update(sdt); bEvents.update(sdt); updatePickups(sdt); netUpdate(dt);
    if (st === 'play' && (!online() || net.isHost)) {
      updateWaves(sdt);
      if (level.key === 'brasilia') bEvents.hostTick(sdt);
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
  {
    let slotSig = player.weaponIndex + '|';
    for (let i = 0; i < player.weapons.length; i++) {
      const wp = player.weapons[i];
      slotSig += (wp.owned ? (wp.isGun ? wp.mag + '/' + wp.reserve : 'i') : 'x') + ',';
    }
    if (slotSig !== hud._lastSlotSig) {
      hud._lastSlotSig = slotSig;
      hud.setSlots(player.weapons.map((wp, i) => ({ name: wp.name, active: i === player.weaponIndex, ammo: wp.owned ? (wp.isGun ? wp.mag + '/' + wp.reserve : '∞') : 'Bloqueada', empty: wp.isGun && wp.mag === 0 && wp.reserve === 0, locked: !wp.owned })));
    }
  }
  hud.setGrenades(player.grenades); hud.setGrappleStamina(player.grapStam); hud.setHealth(player.hp, player.maxHp); hud.setSpread(w.spreadPx); hud.update(dt);
  if (online()) hud.setFocusMeter(playing, player.grapStam, false, 'Gancho');
  else hud.setFocusMeter(playing && (w.kind === 'katana' || game.katanaStreak > 0 || game.focus.active), game.focus.active ? 1 : clamp(game.katanaStreak / KATANA_CHARGE_KILLS, 0, 1), game.focus.active, 'Katana');
  if (game.boss) { if (game.boss.alive) hud.setBoss(game.boss.T.name, game.boss.hp / game.boss.maxHp); else { hud.setBoss(null, null); game.boss = null; } }
  audio.setIntensity(clamp((enemies.alive + game.queue.length + remote.size * 2) / 12, 0, 1) * (game.intermission > 0 ? 0.25 : 1));
  if (minimap) minimap.update(dt, player, enemies.enemies, remote.values());
  R.render(game.time, { hurt: player.hurtFx, flash: player.flashFx, slow: scale < 1 ? 1 : 0, lowHp: player.alive && player.hp < 30 ? 1 - player.hp / 30 : 0 });
}
requestAnimationFrame(tick);
