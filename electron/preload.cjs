// Bridge between the sandboxed renderer (the game) and the Hyperswarm transport in the main
// process. The game's src/net.js detects window.FE_NET and drives multiplayer through it instead
// of PeerJS. Only this narrow, safe surface is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('FE_NET', {
  host: (code) => ipcRenderer.invoke('net:host', { code }),
  join: (code) => ipcRenderer.invoke('net:join', { code }),
  leave: () => ipcRenderer.invoke('net:leave'),
  send: (key, msg) => ipcRenderer.send('net:send', { key, msg }),
  onConnect: (cb) => ipcRenderer.on('net:peer-connect', (_e, d) => cb(d.key)),
  onData: (cb) => ipcRenderer.on('net:peer-data', (_e, d) => cb(d.key, d.msg)),
  onDisconnect: (cb) => ipcRenderer.on('net:peer-disconnect', (_e, d) => cb(d.key)),
});
