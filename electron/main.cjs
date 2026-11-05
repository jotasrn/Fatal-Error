'use strict';
/**
 * Processo principal do Fatal Error (modelo de seguranca e rede P2P do Concord).
 *
 * - Conexao P2P real via Hyperswarm (DHT + Noise criptografado + hole-punching NAT).
 * - Renderer isolado em sandbox real (`sandbox: true`, `contextIsolation: true`, CSP estrito).
 * - Validacao de origem e formato em todo canal IPC, framing limitado a 256 KB,
 *   1 socket por chave publica, limite de peers e rate-limiting anti-flood.
 * - Auto-updater silencioso via GitHub Releases que nunca interrompe uma partida ativa.
 */
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Hyperswarm = require('hyperswarm');

const {
  MAX_PEERS,
  frame,
  makeDecoder,
  isValidLobbyCode,
  isValidPeerKey,
  sanitizeLog,
  isAllowedExternalUrl,
  isTrustedAppUrl,
  filterSafeGpuFlags,
  PeerRateLimiter,
} = require('./security.cjs');

const {
  initUpdater,
  updateStatus,
  check: checkForUpdates,
  installNow,
  noteMatchActive,
  stopUpdater,
} = require('./updater.cjs');

const APP_HTML_PATH = path.join(__dirname, '..', 'index.html');

// Trava de instancia unica: abrir o atalho uma segunda vez foca a janela existente
// em vez de disputar porta UDP/cache ou corromper logs/atualizacoes.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Permite ao Chromium escolher a GPU nativa do monitor; overrides opcionais em
// <userData>/gpu-flags.txt passam por lista branca estrita (nunca aceita --no-sandbox etc.).
try {
  const flagsFile = path.join(app.getPath('userData'), 'gpu-flags.txt');
  const safeFlags = filterSafeGpuFlags(fs.readFileSync(flagsFile, 'utf8'));
  for (const { name, value } of safeFlags) {
    if (value === null) app.commandLine.appendSwitch(name);
    else app.commandLine.appendSwitch(name, value);
  }
} catch {
  /* sem arquivo opcional gpu-flags.txt */
}

function logLine(msg) {
  try {
    const clean = sanitizeLog(msg, 2000);
    const file = path.join(app.getPath('userData'), 'fatal-error.log');
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, file + '.old');
    } catch {
      /* primeiro log */
    }
    fs.appendFileSync(file, `[${new Date().toISOString()}] v${app.getVersion()} ${clean}\n`);
  } catch {
    /* log nunca pode derrubar o jogo */
  }
}

process.on('uncaughtException', (err) => logLine('main-uncaught ' + (err && err.stack || err)));
process.on('unhandledRejection', (reason) => logLine('main-rejection ' + String(reason)));

let win = null;
// Uma sessao P2P ativa por vez: { swarm, conns: Map<keyHex, Socket>, limiter: PeerRateLimiter, selfId }
let sessionState = null;

function isTrustedSender(event) {
  const frameUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
  return isTrustedAppUrl(frameUrl, APP_HTML_PATH);
}

ipcMain.on('log:error', (event, msg) => {
  if (!isTrustedSender(event)) return;
  logLine('renderer ' + sanitizeLog(msg, 2000));
});
ipcMain.on('log:info', (event, msg) => {
  if (!isTrustedSender(event)) return;
  logLine('info ' + sanitizeLog(msg, 2000));
});

const topicFor = (code) =>
  crypto.createHash('sha256').update('fatalerror:v1:' + String(code).trim().toUpperCase()).digest();

function send(toWin, channel, payload) {
  if (toWin && !toWin.isDestroyed()) {
    toWin.webContents.send(channel, payload);
  }
}

async function destroySession() {
  const s = sessionState;
  sessionState = null;
  if (!s) return;
  s.limiter.clear();
  for (const sock of s.conns.values()) {
    try { sock.destroy(); } catch { /* ignore */ }
  }
  s.conns.clear();
  try { await s.swarm.destroy(); } catch { /* ignore */ }
}

async function startSession({ code }) {
  if (!isValidLobbyCode(code)) {
    throw new Error('Codigo de sala invalido');
  }
  const normalizedCode = code.trim().toUpperCase();
  await destroySession();

  const swarm = new Hyperswarm();
  const conns = new Map();
  const limiter = new PeerRateLimiter({ ratePerSec: 140, burst: 220, maxStrikes: 30 });
  const selfId = swarm.keyPair.publicKey.toString('hex');
  const current = { swarm, conns, limiter, selfId };
  sessionState = current;

  swarm.on('connection', (socket, info) => {
    if (sessionState !== current) {
      try { socket.destroy(); } catch { /* ignore */ }
      return;
    }

    const key = info?.publicKey ? info.publicKey.toString('hex') : '';
    if (!isValidPeerKey(key) || key === selfId) {
      try { socket.destroy(); } catch { /* ignore */ }
      return;
    }

    // Limite de conexoes simultaneas para evitar exaustao de descritores.
    if (!conns.has(key) && conns.size >= MAX_PEERS) {
      logLine(`peer recusado por limite de conexoes: ${key.slice(0, 12)}`);
      try { socket.destroy(); } catch { /* ignore */ }
      return;
    }

    // No maximo 1 socket ativo por chave publica Noise (fecha conexao zumbi anterior).
    const existing = conns.get(key);
    if (existing && existing !== socket) {
      conns.delete(key);
      try { existing.destroy(); } catch { /* ignore */ }
    }

    conns.set(key, socket);
    send(win, 'net:peer-connect', { key });

    const killSocket = (reason) => {
      logLine(`peer desconectado por seguranca (${key.slice(0, 12)}): ${reason}`);
      try { socket.destroy(); } catch { /* ignore */ }
    };

    const decode = makeDecoder(
      (msg) => {
        const check = limiter.allow(key);
        if (!check.allowed) {
          if (check.kick) killSocket('rate-limit excedido');
          return;
        }
        send(win, 'net:peer-data', { key, msg });
      },
      (err) => killSocket(err.message),
    );

    socket.on('data', (chunk) => {
      try {
        decode(chunk);
      } catch (err) {
        killSocket(String(err && err.message || err));
      }
    });

    const drop = () => {
      if (conns.get(key) === socket) {
        conns.delete(key);
        limiter.delete(key);
        send(win, 'net:peer-disconnect', { key });
      }
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  const disc = swarm.join(topicFor(normalizedCode), { server: true, client: true });
  await disc.flushed();
  return selfId;
}

ipcMain.handle('net:host', async (event, payload) => {
  if (!isTrustedSender(event)) throw new Error('Origem IPC nao autorizada');
  return startSession({ code: payload && payload.code });
});

ipcMain.handle('net:join', async (event, payload) => {
  if (!isTrustedSender(event)) throw new Error('Origem IPC nao autorizada');
  return startSession({ code: payload && payload.code });
});

ipcMain.handle('net:leave', async (event) => {
  if (!isTrustedSender(event)) throw new Error('Origem IPC nao autorizada');
  await destroySession();
});

ipcMain.on('net:send', (event, payload) => {
  if (!isTrustedSender(event) || !sessionState || !payload) return;
  const { key, msg } = payload;
  if (!isValidPeerKey(key)) return;
  const sock = sessionState.conns.get(key);
  if (!sock) return;
  try {
    sock.write(frame(msg));
  } catch {
    /* pacote invalido ou socket encerrando */
  }
});

ipcMain.on('net:close-peer', (event, payload) => {
  if (!isTrustedSender(event) || !sessionState || !payload) return;
  const { key } = payload;
  if (!isValidPeerKey(key)) return;
  const sock = sessionState.conns.get(key);
  if (sock) {
    sessionState.conns.delete(key);
    sessionState.limiter.delete(key);
    try { sock.destroy(); } catch { /* ignore */ }
  }
});

// ---- IPC de versao e auto-update (modelo Concord) ----
ipcMain.handle('app:info', (event) => {
  if (!isTrustedSender(event)) throw new Error('Origem IPC nao autorizada');
  return {
    version: app.getVersion(),
    packaged: app.isPackaged,
  };
});

ipcMain.handle('update:get-status', (event) => {
  if (!isTrustedSender(event)) throw new Error('Origem IPC nao autorizada');
  return updateStatus();
});

ipcMain.handle('update:check', async (event) => {
  if (!isTrustedSender(event)) throw new Error('Origem IPC nao autorizada');
  return checkForUpdates();
});

ipcMain.handle('update:install', (event) => {
  if (!isTrustedSender(event)) throw new Error('Origem IPC nao autorizada');
  return installNow();
});

ipcMain.on('update:match-active', (event, active) => {
  if (!isTrustedSender(event)) return;
  noteMatchActive(!!active);
});

function hardenSessionPermissions() {
  const ALLOWED_PERMISSIONS = new Set(['pointerLock', 'fullscreen']);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const reqUrl = details?.requestingUrl || webContents?.getURL?.() || '';
    const trusted = isTrustedAppUrl(reqUrl, APP_HTML_PATH);
    callback(trusted && ALLOWED_PERMISSIONS.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (!ALLOWED_PERMISSIONS.has(permission)) return false;
    const currentUrl = webContents?.getURL?.() || requestingOrigin || '';
    return !currentUrl || isTrustedAppUrl(currentUrl, APP_HTML_PATH);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#f9f8f5',
    title: 'Fatal Error',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
    },
  });

  // Impede qualquer <webview> embutido.
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Trava navegacao fora do index.html local; links http(s) abrem no navegador externo.
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url, APP_HTML_PATH)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });

  // Nega abertura de popups internos; redireciona http(s) seguros ao navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    win.webContents.on('devtools-opened', () => {
      win?.webContents.closeDevTools();
    });
  }

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    // Bloqueia atalhos de DevTools na build instalada de producao.
    if (app.isPackaged) {
      const key = String(input.key || '').toUpperCase();
      if (
        key === 'F12' ||
        ((input.control || input.meta) && input.shift && (key === 'I' || key === 'J' || key === 'C'))
      ) {
        event.preventDefault();
        return;
      }
    }
    // F11 alterna tela cheia.
    if (input.key === 'F11' && win && !win.isDestroyed()) {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.webContents.on('render-process-gone', (_e, d) => {
    logLine('render-process-gone ' + JSON.stringify(d));
    if (win && !win.isDestroyed()) {
      setTimeout(() => win && !win.isDestroyed() && win.reload(), 500);
    }
  });
  win.webContents.on('unresponsive', () => logLine('window unresponsive'));

  win.setMenuBarVisibility(false);
  win.loadFile(APP_HTML_PATH);
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on('child-process-gone', (_e, d) => logLine('child-process-gone ' + JSON.stringify(d)));

if (gotLock) {
  app.whenReady().then(() => {
    hardenSessionPermissions();
    createWindow();
    initUpdater(() => win, logLine);
    setTimeout(() => {
      try { logLine('gpu-features-5s ' + JSON.stringify(app.getGPUFeatureStatus())); } catch { /* ignore */ }
    }, 5000);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  stopUpdater();
});

app.on('window-all-closed', () => {
  stopUpdater();
  destroySession().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});
