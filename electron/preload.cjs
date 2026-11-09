'use strict';
// Ponte estrita e imutavel entre o renderer em sandbox (`sandbox: true`) e o processo principal.
// Expoe somente os canais necessarios para log, transporte P2P Hyperswarm e atualizacao automatica.
const { contextBridge, ipcRenderer } = require('electron');

function bindSingleChannel(channel, transform) {
  let activeHandler = null;
  return (cb) => {
    if (typeof cb !== 'function') return () => {};
    if (activeHandler) ipcRenderer.removeListener(channel, activeHandler);
    activeHandler = (_event, payload) => transform(cb, payload);
    ipcRenderer.on(channel, activeHandler);
    return () => {
      if (activeHandler) {
        ipcRenderer.removeListener(channel, activeHandler);
        activeHandler = null;
      }
    };
  };
}

contextBridge.exposeInMainWorld('FE_LOG', Object.freeze({
  error: (msg) => ipcRenderer.send('log:error', String(msg ?? '').slice(0, 2000)),
  info: (msg) => ipcRenderer.send('log:info', String(msg ?? '').slice(0, 2000)),
}));

contextBridge.exposeInMainWorld('FE_NET', Object.freeze({
  host: (code) => ipcRenderer.invoke('net:host', { code: String(code ?? '') }),
  join: (code) => ipcRenderer.invoke('net:join', { code: String(code ?? '') }),
  leave: () => ipcRenderer.invoke('net:leave'),
  send: (key, msg) => ipcRenderer.send('net:send', { key: String(key ?? ''), msg }),
  closePeer: (key) => ipcRenderer.send('net:close-peer', { key: String(key ?? '') }),
  onConnect: bindSingleChannel('net:peer-connect', (cb, d) => d && cb(d.key)),
  onData: bindSingleChannel('net:peer-data', (cb, d) => d && cb(d.key, d.msg)),
  onDisconnect: bindSingleChannel('net:peer-disconnect', (cb, d) => d && cb(d.key)),
}));

contextBridge.exposeInMainWorld('FE_LAN', Object.freeze({
  host: (opts = {}) => ipcRenderer.invoke('lan:host', {
    hostName: String(opts.hostName ?? '').slice(0, 24),
    isPublic: opts.isPublic !== false,
  }),
  join: (target, timeoutMs = 2200) => ipcRenderer.invoke('lan:join', {
    target: String(target ?? '').slice(0, 32),
    timeoutMs: Number(timeoutMs) || 2200,
  }),
  discover: (timeoutMs = 450) => ipcRenderer.invoke('lan:discover', {
    timeoutMs: Number(timeoutMs) || 450,
  }),
  updateMeta: (meta = {}) => ipcRenderer.send('lan:meta', {
    hostName: typeof meta.hostName === 'string' ? meta.hostName.slice(0, 24) : undefined,
    isPublic: typeof meta.isPublic === 'boolean' ? meta.isPublic : undefined,
    inMatch: typeof meta.inMatch === 'boolean' ? meta.inMatch : undefined,
    accepting: typeof meta.accepting === 'boolean' ? meta.accepting : undefined,
    maxPlayers: Number.isFinite(meta.maxPlayers) ? Number(meta.maxPlayers) : undefined,
  }),
  leave: () => ipcRenderer.invoke('lan:leave'),
  send: (key, msg) => ipcRenderer.send('lan:send', { key: String(key ?? ''), msg }),
  closePeer: (key) => ipcRenderer.send('lan:close-peer', { key: String(key ?? '') }),
  onConnect: bindSingleChannel('lan:peer-connect', (cb, d) => d && cb(d.key)),
  onData: bindSingleChannel('lan:peer-data', (cb, d) => d && cb(d.key, d.msg)),
  onDisconnect: bindSingleChannel('lan:peer-disconnect', (cb, d) => d && cb(d.key)),
}));

contextBridge.exposeInMainWorld('FE_UPDATE', Object.freeze({
  getInfo: () => ipcRenderer.invoke('app:info'),
  getStatus: () => ipcRenderer.invoke('update:get-status'),
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
  setMatchActive: (active) => ipcRenderer.send('update:match-active', !!active),
  onStatus: bindSingleChannel('update:status', (cb, status) => status && cb(status)),
}));

contextBridge.exposeInMainWorld('FE_WIN', Object.freeze({
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleFullScreen: () => ipcRenderer.send('win:toggle-fullscreen'),
  isFullScreen: () => ipcRenderer.invoke('win:is-fullscreen'),
}));
