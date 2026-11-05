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

contextBridge.exposeInMainWorld('FE_UPDATE', Object.freeze({
  getInfo: () => ipcRenderer.invoke('app:info'),
  getStatus: () => ipcRenderer.invoke('update:get-status'),
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
  setMatchActive: (active) => ipcRenderer.send('update:match-active', !!active),
  onStatus: bindSingleChannel('update:status', (cb, status) => status && cb(status)),
}));
