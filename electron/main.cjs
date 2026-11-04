// Electron main process for Fatal Error.
//
// This is the "Concord model": instead of a browser talking to the public PeerJS broker (which
// fails across strict NAT), the game runs in Electron and the connection is a real peer-to-peer
// link found through Hyperswarm's DHT with built-in hole-punching — no signalling server, no TURN
// relay, it just works between networks. The Three.js game itself runs unchanged in the renderer;
// this process owns the swarm and pipes framed JSON messages to/from the renderer over IPC, where
// src/net.js (SwarmNet) does all the host/client lobby logic.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Hyperswarm = require('hyperswarm');

// No GPU/compositor command-line switches: forcing the discrete GPU (1.0.4-1.0.8) made machines
// whose monitor hangs off the integrated GPU render on one adapter and copy every frame to the
// other, which shows up as stutter and a laggy mouse. Chromium's own adapter choice is used again.

function logLine(msg) {
  try {
    const file = path.join(app.getPath('userData'), 'fatal-error.log');
    try { if (fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, file + '.old'); } catch { /* no log yet */ }
    fs.appendFileSync(file, `[${new Date().toISOString()}] v${app.getVersion()} ${msg}\n`);
  } catch { /* logging must never crash the game */ }
}
ipcMain.on('log:error', (_e, msg) => logLine('renderer ' + msg));
ipcMain.on('log:info', (_e, msg) => logLine('info ' + msg));
process.on('uncaughtException', (err) => logLine('main ' + (err && err.stack || err)));

let win = null;
// one live session at a time: { swarm, conns: Map<keyHex, socket>, selfId }
let session = null;

const topicFor = (code) => crypto.createHash('sha256').update('fatalerror:v1:' + String(code).toUpperCase()).digest();

// Length-prefixed JSON framing over the raw encrypted stream (4-byte big-endian length + utf8).
function frame(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.allocUnsafe(4); head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}
function makeDecoder(onMessage) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 4) {
      const len = buf.readUInt32BE(0);
      if (len > 8 * 1024 * 1024) { buf = Buffer.alloc(0); return; } // guard against a bad peer
      if (buf.length < 4 + len) break;
      const body = buf.subarray(4, 4 + len); buf = buf.subarray(4 + len);
      let msg; try { msg = JSON.parse(body.toString('utf8')); } catch { continue; }
      onMessage(msg);
    }
  };
}

function send(toWin, channel, payload) { if (toWin && !toWin.isDestroyed()) toWin.webContents.send(channel, payload); }

async function destroySession() {
  const s = session; session = null;
  if (!s) return;
  for (const sock of s.conns.values()) { try { sock.destroy(); } catch { /* ignore */ } }
  s.conns.clear();
  try { await s.swarm.destroy(); } catch { /* ignore */ }
}

async function startSession({ code, asHost }) {
  await destroySession();
  const swarm = new Hyperswarm();
  const conns = new Map();
  const selfId = swarm.keyPair.publicKey.toString('hex');
  session = { swarm, conns, selfId };

  swarm.on('connection', (socket, info) => {
    const key = info.publicKey.toString('hex');
    conns.set(key, socket);
    send(win, 'net:peer-connect', { key });
    const decode = makeDecoder((msg) => send(win, 'net:peer-data', { key, msg }));
    socket.on('data', (chunk) => { try { decode(chunk); } catch { /* ignore */ } });
    const drop = () => { if (conns.get(key) === socket) { conns.delete(key); send(win, 'net:peer-disconnect', { key }); } };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  // Everyone both announces and looks up (full mesh): it is far faster and more reliable to form
  // the link than a server-only/client-only split. The star shape the host-authoritative game
  // wants is enforced in src/net.js instead — only the host answers a hello with a welcome, and a
  // client ignores data from any peer that is not the host, so client↔client links sit idle.
  const disc = swarm.join(topicFor(code), { server: true, client: true });
  await disc.flushed();
  return selfId;
}

ipcMain.handle('net:host', (_e, { code }) => startSession({ code, asHost: true }));
ipcMain.handle('net:join', (_e, { code }) => startSession({ code, asHost: false }));
ipcMain.handle('net:leave', () => destroySession());
ipcMain.on('net:send', (_e, { key, msg }) => {
  if (!session) return;
  const sock = session.conns.get(key);
  if (sock) { try { sock.write(frame(msg)); } catch { /* ignore */ } }
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 960, minHeight: 540,
    backgroundColor: '#f9f8f5', title: 'Fatal Error',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
    },
  });
  // if the page or the GPU process dies, log why and bring the game back instead of a dead window
  win.webContents.on('render-process-gone', (_e, d) => { logLine('render-process-gone ' + JSON.stringify(d)); if (win && !win.isDestroyed()) setTimeout(() => win && !win.isDestroyed() && win.reload(), 500); });
  win.webContents.on('unresponsive', () => logLine('window unresponsive'));
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.on('closed', () => { win = null; });
}

app.on('child-process-gone', (_e, d) => logLine('child-process-gone ' + JSON.stringify(d)));
app.whenReady().then(() => {
  // record which GPU(s) this machine has and what Chromium enabled, for diagnosing performance
  app.getGPUInfo('basic').then((info) => logLine('gpu ' + JSON.stringify((info && info.gpuDevice) || info))).catch(() => {});
  try { logLine('gpu-features ' + JSON.stringify(app.getGPUFeatureStatus())); } catch { /* ignore */ }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { destroySession().finally(() => { if (process.platform !== 'darwin') app.quit(); }); });
