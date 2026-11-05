'use strict';
/**
 * Atualizacao automatica via GitHub Releases (modelo Concord).
 *
 * Duas regras centrais:
 * 1. Zero atrito: verifica em segundo plano, baixa sozinho (autoDownload) e instala
 *    automaticamente quando o jogador fechar o jogo (autoInstallOnAppQuit).
 * 2. NUNCA interromper uma partida em andamento: enquanto `emPartida` for true,
 *    nenhum reinicio automatico ou acidental acontece. Quando voltar ao menu ou
 *    sala de espera, um aviso discreto oferece atualizar com 1 clique.
 */
const { app } = require('electron');

const INTERVALO_CHECK_MS = 4 * 60 * 60 * 1000;
const ATRASO_PRIMEIRO_CHECK_MS = 15_000;

let status = {
  state: 'idle',
  version: null,
  percent: 0,
  message: null,
  waitingForMatch: false,
};

let getWindow = null;
let logFn = () => {};
let emPartida = false;
let timer = null;
let iniciado = false;

function publicar(parcial) {
  status = { ...status, ...parcial };
  const w = getWindow && getWindow();
  if (w && !w.isDestroyed()) {
    w.webContents.send('update:status', status);
  }
}

function updateStatus() {
  return { ...status };
}

function getAutoUpdater() {
  const { autoUpdater } = require('electron-updater');
  return autoUpdater;
}

function initUpdater(janelaGetter, logger = () => {}) {
  getWindow = janelaGetter;
  logFn = logger;
  if (iniciado) return;
  iniciado = true;

  if (!app.isPackaged) {
    publicar({
      state: 'unsupported',
      message: 'Atualizacao automatica ativa apenas na versao instalada',
    });
    return;
  }

  let auto;
  try {
    auto = getAutoUpdater();
  } catch (err) {
    logFn('updater indisponivel: ' + String(err && err.message || err));
    publicar({ state: 'unsupported', message: 'Atualizacao automatica indisponivel' });
    return;
  }

  auto.autoDownload = true;
  auto.autoInstallOnAppQuit = true;
  auto.logger = {
    info: (m) => logFn('updater info: ' + String(m)),
    warn: (m) => logFn('updater warn: ' + String(m)),
    error: (m) => logFn('updater error: ' + String(m)),
    debug: () => undefined,
  };

  auto.on('checking-for-update', () => {
    publicar({ state: 'checking', message: null });
  });

  auto.on('update-available', (info) => {
    logFn('atualizacao encontrada: v' + info.version);
    publicar({
      state: 'downloading',
      version: info.version || null,
      percent: 0,
      message: null,
    });
  });

  auto.on('update-not-available', () => {
    publicar({ state: 'idle', version: null, percent: 0, message: null });
  });

  auto.on('download-progress', (p) => {
    publicar({
      state: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(Number(p && p.percent) || 0))),
    });
  });

  auto.on('update-downloaded', (info) => {
    logFn('atualizacao v' + info.version + ' pronta para instalar');
    publicar({
      state: 'ready',
      version: info.version || null,
      percent: 100,
      message: null,
      waitingForMatch: emPartida,
    });
  });

  auto.on('error', (err) => {
    logFn('updater erro: ' + String(err && err.message || err));
    publicar({ state: 'error', message: 'Nao foi possivel verificar atualizacoes agora' });
  });

  setTimeout(() => { void check(); }, ATRASO_PRIMEIRO_CHECK_MS);
  timer = setInterval(() => { void check(); }, INTERVALO_CHECK_MS);
}

async function check() {
  if (!app.isPackaged || status.state === 'checking' || status.state === 'downloading') {
    return updateStatus();
  }
  if (status.state === 'ready') return updateStatus();
  try {
    await getAutoUpdater().checkForUpdates();
  } catch (err) {
    logFn('falha ao checar atualizacao: ' + String(err && err.message || err));
    publicar({ state: 'error', message: 'Nao foi possivel verificar atualizacoes' });
  }
  return updateStatus();
}

function installNow() {
  if (status.state !== 'ready') {
    return { ok: false, motivo: 'Nenhuma atualizacao pronta para instalar' };
  }
  if (emPartida) {
    publicar({ waitingForMatch: true });
    return { ok: false, motivo: 'Partida em andamento — finalize ou volte ao menu antes de reiniciar' };
  }
  logFn('instalando atualizacao v' + status.version + ' a pedido do jogador');
  setImmediate(() => {
    try {
      getAutoUpdater().quitAndInstall(false, true);
    } catch (err) {
      logFn('quitAndInstall falhou: ' + String(err && err.message || err));
    }
  });
  return { ok: true };
}

function noteMatchActive(active) {
  const next = !!active;
  if (emPartida === next) return;
  emPartida = next;
  if (status.state === 'ready') {
    publicar({ waitingForMatch: emPartida });
  }
}

function stopUpdater() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  initUpdater,
  updateStatus,
  check,
  installNow,
  noteMatchActive,
  stopUpdater,
};

