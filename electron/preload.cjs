// Bridge between the sandboxed renderer (the game) and the Hyperswarm transport in the main
// process. The game's src/net.js detects window.FE_NET and drives multiplayer through it instead
// of PeerJS. Only this narrow, safe surface is exposed.
const { contextBridge, ipcRenderer } = require('electron');

// errors from the game go to <userData>/fatal-error.log so a crash can be diagnosed afterwards
contextBridge.exposeInMainWorld('FE_LOG', {
  error: (msg) => ipcRenderer.send('log:error', String(msg).slice(0, 4000)),
  info: (msg) => ipcRenderer.send('log:info', String(msg).slice(0, 4000)),
});

contextBridge.exposeInMainWorld('FE_NET', {
  host: (code) => ipcRenderer.invoke('net:host', { code }),
  join: (code) => ipcRenderer.invoke('net:join', { code }),
  leave: () => ipcRenderer.invoke('net:leave'),
  send: (key, msg) => ipcRenderer.send('net:send', { key, msg }),
  onConnect: (cb) => ipcRenderer.on('net:peer-connect', (_e, d) => cb(d.key)),
  onData: (cb) => ipcRenderer.on('net:peer-data', (_e, d) => cb(d.key, d.msg)),
  onDisconnect: (cb) => ipcRenderer.on('net:peer-disconnect', (_e, d) => cb(d.key)),
});
