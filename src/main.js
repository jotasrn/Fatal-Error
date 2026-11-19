// Game bootstrap: initializes core systems, wires modules, and starts the loop.
import * as THREE from 'three';
import { InkRenderer } from './core/render.js';
import { World } from './core/physics.js';
import { Input } from './core/input.js';
import { buildLevel, LEVELS } from './levels/index.js';
import { NavGrid } from './core/nav.js';
import { Effects } from './core/effects.js';
import { EnemyManager } from './enemies/index.js';
import { BotBatcher } from './enemies/batch.js';
import { Minimap } from './ui/minimap.js';
import { Player } from './player/index.js';
import { Net } from './net/net.js';
import { HUD } from './ui/hud.js';
import { audio } from './core/audio.js';
import { rand } from './core/util.js';
import { createSurvival } from './game/survival.js';
import { createBrasiliaEvents } from './game/brasiliaEvents.js';
import { createDestruction } from './game/destruction.js';
import { createEnvironment } from './game/environment.js';
import { createBrasiliaTraffic } from './game/brasiliaTraffic.js';
import { createPvpCombat } from './game/pvpCombat.js';
import { createLobbyManager } from './net/lobby.js';
import { createSettingsManager } from './ui/settingsScreen.js';
import { createScreensManager } from './ui/screens.js';
import { createGameLoop } from './game/loop.js';
import { progression } from './game/progression.js';
import { MissionManager } from './game/missions.js';
import { sanitizeName } from './core/security.js';

const canvas = document.getElementById('c');
const R = new InkRenderer(canvas);
const world = new World();
const knownMap = (k) => (LEVELS.some((m) => m.key === k) ? k : 'brasilia');
const navCellFor = (b) => (Math.max(b.maxX - b.minX, b.maxZ - b.minZ) > 350 ? 2.0 : 1.0);
let mapKey = knownMap(localStorage.getItem('fatal_map') || 'brasilia');
let level = buildLevel(R.scene, world, mapKey, { arena: false });
let nav = new NavGrid(world, level.navBounds || level.bounds, navCellFor(level.navBounds || level.bounds)).build();
let loadedKey = mapKey, arenaLoaded = false;
audio.setTune('district');

const input = new Input(canvas);
const hud = new HUD(document.getElementById('hud'));
const minimap = new Minimap(hud.root); minimap.setLevel(level, world);
hud.onToggleMap = () => {
  const open = minimap.toggleFullMap();
  if (open) input.exitLock();
  else if (!input.usingGamepad) input.requestLock();
};
const effects = new Effects(R.scene, world);
const ctx = { scene: R.scene, camera: R.camera, world, level, nav, input, hud, effects, audio, renderer: R };

let best = Number(localStorage.getItem('fatal_best') || 0);
let musicWanted = localStorage.getItem('fatal_music') !== '0';
try { localStorage.removeItem('fatal_checkpoint'); } catch (e) { /* checkpoint removido */ }
let myName = sanitizeName(localStorage.getItem('fatal_name') || '', 'Jogador' + Math.floor(Math.random() * 90 + 10));

const net = new Net();
const remote = ctx.remote = new Map();
const lobby = { players: new Map(), hostId: null, isPublic: true, status: '', code: '', map: null, gameMode: 'ffa' };
const scores = new Map();
const online = () => game.mode === 'ffa';

function setLevel(key, on, force = false) {
  if (!force && key === loadedKey && on === arenaLoaded) return;
  loadedKey = key; arenaLoaded = on;
  for (const m of level.meshes) { R.scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.traverse) m.traverse((o) => { if (o !== m && o.geometry) o.geometry.dispose(); }); }
  level.animated.length = 0; world.clear();
  if (ctx.bEvents) ctx.bEvents.clear();
  if (ctx.missions) ctx.missions.clear();
  level = buildLevel(R.scene, world, key, { arena: on });
  nav = new NavGrid(world, level.navBounds || level.bounds, navCellFor(level.navBounds || level.bounds)).build();
  ctx.level = level; ctx.nav = nav;
  if (minimap) minimap.setLevel(level, world);
  if (window.__game) { window.__game.level = level; window.__game.nav = nav; }
  audio.setTune('district');
}
const setArena = (on) => setLevel(knownMap(net.active ? (lobby.map || mapKey) : mapKey), on);

let lobbyMgr = null, screensMgr = null, loopMgr = null;
const game = ctx.game = {
  state: 'start', mode: 'solo', menu: false, time: 0, hitstopT: 0, hitstopScale: 1, wave: 0, score: 0, combo: 0, comboT: 0, kills: 0, intermission: 0, queue: [], spawnT: 0, maxAlive: 6, deathT: 0,
  focus: { active: false, t: 0, chain: 0, target: null, dash: null, arm: 0, ready: false }, katanaStreak: 0, boss: null, respawnT: 0, matchT: 0, over: null, overT: 0,
  hitstop(d, s) { this.hitstopT = Math.max(this.hitstopT, d); this.hitstopScale = s; },
  addScore(pts, label) { const mult = 1 + Math.min(this.combo, 9) * 0.25; const p = Math.round(pts * mult); this.score += p; if (label) hud.kill(label, p); hud.setScore(this.score, this.combo); },
  onPlayerDeath() { survival.endFocus(); lobbyMgr.onLocalDeath(); },
};

const enemies = ctx.enemies = new EnemyManager(ctx);
enemies.prewarm();
const batcher = ctx.batcher = new BotBatcher(R.scene);
R.beforeRender = (cam) => batcher.update(enemies.enemies, cam);
const player = ctx.player = new Player(ctx);
hud.onBuy = (itemKey) => { player.buyItem(itemKey); hud.toggleBuyMenu(true, player); };
hud.setMoney(player.money); hud.setArmor(player.armor, player.maxArmor);
player.name = myName;
ctx.progression = progression;
const missions = ctx.missions = new MissionManager(ctx);
window.__game = { ctx, game, player, enemies, nav, world, level, hud, effects, input, net, remote, lobby, scores, missions, progression };

const survival = ctx.survival = createSurvival(ctx, { net, online, getCheckpoint: () => 0, setCheckpoint: () => {} });
const env = ctx.env = createEnvironment(ctx);  // ciclo dia/noite, clima e horário de pico
window.__game.env = env;
const crowd = ctx.crowd = () => { if (!online()) return 1; let n = 1; for (const r of remote.values()) if (!r.away) n++; return Math.min(3, 1 + 0.6 * (n - 1)); };
const snapNav = (v) => { const id = nav.nearestNode(v, 4, 3); if (id >= 0) { const nd = nav.nodes[id]; v.set(nd.x, nd.y + 0.05, nd.z); } return v; };
const bEvents = ctx.bEvents = createBrasiliaEvents(ctx, {
  net, online, snap: snapNav, crowd, manifest: () => triggerBrasiliaManifestation(),
  onCrash: (pos) => { for (let i = 0; i < 2; i++) { const p = enemies.spawn(i ? 'police_tactical' : 'police', snapNav(new THREE.Vector3(pos.x + rand(-10, 10), 0, pos.z + rand(-10, 10)))); p.state = 'hunt'; } audio.siren(pos); },
});
ctx.rioterProps = () => bEvents.rioterProps();

const { breakProp, destroyEnvironmentAt } = createDestruction(ctx, { world, effects, audio, scene: R.scene, net, game, spawnPickup: survival.spawnPickup });
ctx.destroyEnvironmentAt = destroyEnvironmentAt;
const { triggerBrasiliaManifestation, updateTrafficHits, spawnBrasiliaCivilians, maintainBrasiliaPedestrians } = createBrasiliaTraffic(ctx, { net, online, audio, hud, bEvents });

const { shotQueue } = createPvpCombat(ctx, {
  player, remote, enemies, level, world, effects, audio, hud, input, net, game,
  online, inMatch: () => lobbyMgr.inMatch(), breakProp, spawnPickup: survival.spawnPickup,
  enterFocus: survival.enterFocus, KATANA_CHARGE_KILLS: survival.KATANA_CHARGE_KILLS,
});

lobbyMgr = createLobbyManager(ctx, {
  net, remote, lobby, scores, game, player, enemies, hud, effects, audio, input,
  progression, bEvents, shotQueue, online, knownMap, setLevel, setArena,
  breakProp, spawnPickup: survival.spawnPickup, removePickup: survival.removePickup, pickups: survival.pickups,
  getMapKey: () => mapKey, getLoadedKey: () => loadedKey, getMyName: () => myName,
  endFocus: survival.endFocus, showStart: () => screensMgr.showStart(), resetGame: () => loopMgr.resetGame(),
  startMatch: (...a) => loopMgr.startMatch(...a), toLobbyScreen: () => loopMgr.toLobbyScreen(),
  hostStart: () => loopMgr.hostStart(), unlockButtons: () => screensMgr.unlockButtons(),
  renderLobby: () => screensMgr.renderLobby(), setScreen: (s) => screensMgr.setScreen(s),
});
const settingsMgr = createSettingsManager(ctx, {
  R, effects, input, hud, minimap, audio, game,
  getMusicWanted: () => musicWanted, setMusicWanted: (v) => { musicWanted = v; },
  getPerf: () => loopMgr.perf, showStart: () => screensMgr.showStart(),
});
screensMgr = createScreensManager(ctx, {
  hud, game, player, enemies, net, lobby, progression, audio,
  online, knownMap, setLevel, getMapKey: () => mapKey, setMapKey: (k) => { mapKey = k; },
  getMyName: () => myName, setMyName: (n) => { myName = n; }, getBest: () => best, setBest: (b) => { best = b; },
  settingsMgr, lobbyMgr, getLoopMgr: () => loopMgr,
});
loopMgr = createGameLoop(ctx, {
  R, canvas, input, hud, minimap, effects, audio, player, enemies, net, remote,
  lobby, scores, missions, bEvents, survival, game, online,
  knownMap, setLevel, setArena, getLoadedKey: () => loadedKey, getArenaLoaded: () => arenaLoaded,
  getMapKey: () => mapKey, getMyName: () => myName, getMusicWanted: () => musicWanted, setMusicWanted: (v) => { musicWanted = v; },
  updateTrafficHits, spawnBrasiliaCivilians, maintainBrasiliaPedestrians, lobbyMgr, screensMgr, settingsMgr,
});
Object.assign(window.__game, {
  bEvents, startWave: survival.startWave, updateWaves: survival.updateWaves,
  begin: loopMgr.begin, beginAtWave: loopMgr.beginAtWave, jumpToWave: loopMgr.jumpToWave,
  resetGame: loopMgr.resetGame, spawnPickup: survival.spawnPickup, focusCandidate: survival.focusCandidate,
  enterFocus: survival.enterFocus, pickSpawn: survival.pickSpawn, startMatch: loopMgr.startMatch,
  createLobby: lobbyMgr.createLobby, joinLobby: lobbyMgr.joinLobby, quickPlay: lobbyMgr.quickPlay,
  leaveOnline: lobbyMgr.leaveOnline, hostStart: loopMgr.hostStart,
});

// Bridge de compatibilidade Tauri 2.0 (Rust) caso não esteja rodando sob preload do Electron
if (typeof window !== 'undefined' && window.__TAURI__?.core?.invoke) {
  const inv = window.__TAURI__.core.invoke;
  const listen = window.__TAURI__.event?.listen;
  if (!window.FE_WIN) window.FE_WIN = { minimize: () => inv('fe_win_minimize').catch(() => {}), toggleFullScreen: () => inv('fe_win_toggle_fullscreen').catch(() => {}) };
  if (!window.FE_LAN && listen) {
    window.FE_LAN = {
      host: (o = {}) => inv('fe_lan_host', { hostName: String(o.hostName || 'Jogador') }),
      join: (o = {}) => inv('fe_lan_join', { target: String(o.target || '') }),
      send: (key, msg) => inv('fe_lan_send', { key: String(key), msg }),
      leave: () => inv('fe_lan_leave').catch(() => {}),
      onPeerJoin: (cb) => { listen('lan:peer-join', (e) => cb(e.payload)); },
      onPeerLeave: (cb) => { listen('lan:peer-leave', (e) => cb(e.payload)); },
      onPeerData: (cb) => { listen('lan:peer-data', (e) => cb(e.payload)); },
      discover: async () => [],
    };
  }
}
const btnWinMin = document.getElementById('fe-btn-min');
if (btnWinMin) btnWinMin.addEventListener('click', (e) => { e.stopPropagation(); if (window.FE_WIN?.minimize) window.FE_WIN.minimize(); });
const btnWinFs = document.getElementById('fe-btn-fs');
if (btnWinFs) btnWinFs.addEventListener('click', (e) => {
  e.stopPropagation();
  if (window.FE_WIN?.toggleFullScreen) window.FE_WIN.toggleFullScreen();
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});

loopMgr.start();
