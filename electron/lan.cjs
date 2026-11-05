'use strict';
/**
 * Transporte nativo de Rede Interna / Corporativa (GDFNet / LAN) sobre TCP + UDP Discovery.
 *
 * Opera 100% dentro da rede local (ex.: 10.63.30.x na GDFNet), sem depender de DHT UDP externo,
 * mDNS (.local) ou servidores STUN/TURN bloqueados pelo proxy/firewall corporativo.
 *
 * Reutiliza exatamente as mesmas primitivas de seguranca do Hyperswarm (`frame`, `makeDecoder`,
 * `MAX_PEERS`, `PeerRateLimiter` e anti-SSRF `isValidPrivateLanIp`).
 */
const net = require('node:net');
const dgram = require('node:dgram');
const os = require('node:os');
const crypto = require('node:crypto');

const {
  MAX_PEERS,
  LAN_DISCOVERY_PORT,
  LAN_PORT_BASE,
  LAN_PORT_COUNT,
  frame,
  makeDecoder,
  isValidPeerKey,
  isValidPrivateLanIp,
  encodeLanCode,
  parseLanTarget,
  PeerRateLimiter,
} = require('./security.cjs');

const VIRTUAL_IFACE_RE = /(vethernet|wsl|hyper-v|docker|vmware|vbox|virtualbox|loopback|teredo|isatap|npcap)/i;

function computeBroadcast(ip, netmask) {
  const ipParts = String(ip || '').split('.').map(Number);
  const maskParts = String(netmask || '').split('.').map(Number);
  if (ipParts.length !== 4 || maskParts.length !== 4) return null;
  if (ipParts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  if (maskParts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ipParts.map((oct, i) => (oct | (~maskParts[i] & 255))).join('.');
}

/**
 * Seleciona interfaces IPv4 fisicas privadas, priorizando 10.x.x.x (redes corporativas como GDFNet)
 * e 192.168.x.x, ignorando switches virtuais (WSL / Hyper-V / Docker).
 */
function listLanInterfaces() {
  const raw = os.networkInterfaces();
  const candidates = [];
  for (const [name, entries] of Object.entries(raw || {})) {
    if (!Array.isArray(entries)) continue;
    const isVirtual = VIRTUAL_IFACE_RE.test(name);
    for (const info of entries) {
      if (!info || info.internal) continue;
      const family = info.family === 4 || info.family === 'IPv4';
      if (!family || !isValidPrivateLanIp(info.address)) continue;
      const ip = info.address;
      let score = isVirtual ? 0 : 100;
      if (ip.startsWith('10.')) score += 40;
      else if (ip.startsWith('192.168.')) score += 30;
      else if (ip.startsWith('172.')) score += 20;
      candidates.push({
        name,
        ip,
        netmask: info.netmask || '255.255.255.0',
        broadcast: computeBroadcast(ip, info.netmask || '255.255.255.0'),
        score,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) {
    candidates.push({
      name: 'loopback',
      ip: '127.0.0.1',
      netmask: '255.0.0.0',
      broadcast: '127.255.255.255',
      score: 1,
    });
  }
  return candidates;
}

function listenOnPortRange(server, basePort, count) {
  return new Promise((resolve, reject) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= count) {
        reject(new Error('Nenhuma porta local disponivel para hospedar sala GDFNet'));
        return;
      }
      const port = basePort + idx++;
      const onErr = (err) => {
        server.removeListener('listening', onListening);
        if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
          tryNext();
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.removeListener('error', onErr);
        resolve(port);
      };
      server.once('error', onErr);
      server.once('listening', onListening);
      server.listen(port, '0.0.0.0');
    };
    tryNext();
  });
}

function createLanManager({ onEvent = () => {}, logLine = () => {} } = {}) {
  let state = null;

  async function leave() {
    const cur = state;
    state = null;
    if (!cur) return;
    cur.limiter.clear();
    for (const sock of cur.pendingSockets) {
      try { sock.destroy(); } catch { /* ignore */ }
    }
    cur.pendingSockets.clear();
    for (const sock of cur.conns.values()) {
      try { sock.destroy(); } catch { /* ignore */ }
    }
    cur.conns.clear();
    if (cur.udp) {
      try { cur.udp.close(); } catch { /* ignore */ }
    }
    if (cur.server) {
      await new Promise((resolve) => {
        try { cur.server.close(() => resolve()); } catch { resolve(); }
      });
    }
  }

  function wireAuthenticatedSocket(cur, socket, remoteKey) {
    if (state !== cur) {
      try { socket.destroy(); } catch { /* ignore */ }
      return;
    }
    const prev = cur.conns.get(remoteKey);
    if (prev && prev !== socket) {
      cur.conns.delete(remoteKey);
      try { prev.destroy(); } catch { /* ignore */ }
    }
    cur.conns.set(remoteKey, socket);
    onEvent('lan:peer-connect', { key: remoteKey });

    const drop = () => {
      if (cur.conns.get(remoteKey) === socket) {
        cur.conns.delete(remoteKey);
        cur.limiter.delete(remoteKey);
        onEvent('lan:peer-disconnect', { key: remoteKey });
      }
    };
    socket.on('close', drop);
    socket.on('error', drop);
  }

  function attachSocketFraming(cur, socket, isServerSide, onReady = null) {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 5000);
    cur.pendingSockets.add(socket);

    let remoteKey = null;
    const handshakeTimer = setTimeout(() => {
      if (!remoteKey) {
        try { socket.destroy(); } catch { /* ignore */ }
      }
    }, 5000);

    const kill = (reason) => {
      clearTimeout(handshakeTimer);
      cur.pendingSockets.delete(socket);
      logLine(`lan peer encerrado (${remoteKey ? remoteKey.slice(0, 12) : 'unauth'}): ${reason}`);
      try { socket.destroy(); } catch { /* ignore */ }
    };

    const decode = makeDecoder(
      (msg) => {
        if (state !== cur) return;
        if (!remoteKey) {
          if (msg.t !== '__lan_id' || !msg.d || !isValidPeerKey(msg.d.id) || msg.d.id === cur.selfId) {
            kill('handshake LAN invalido');
            return;
          }
          if (isServerSide && !cur.conns.has(msg.d.id) && cur.conns.size >= MAX_PEERS) {
            kill('limite de peers LAN atingido');
            return;
          }
          remoteKey = msg.d.id;
          clearTimeout(handshakeTimer);
          cur.pendingSockets.delete(socket);
          wireAuthenticatedSocket(cur, socket, remoteKey);
          if (onReady) onReady(remoteKey);
          return;
        }

        const check = cur.limiter.allow(remoteKey);
        if (!check.allowed) {
          if (check.kick) kill('rate-limit LAN excedido');
          return;
        }
        onEvent('lan:peer-data', { key: remoteKey, msg });
      },
      (err) => kill(err.message),
    );

    socket.on('data', (chunk) => {
      try {
        decode(chunk);
      } catch (err) {
        kill(String(err && err.message || err));
      }
    });
    socket.on('close', () => {
      clearTimeout(handshakeTimer);
      cur.pendingSockets.delete(socket);
    });
    socket.on('error', () => {
      clearTimeout(handshakeTimer);
      cur.pendingSockets.delete(socket);
    });

    try {
      socket.write(frame({ t: '__lan_id', d: { id: cur.selfId } }));
    } catch (err) {
      kill(String(err && err.message || err));
    }
  }

  async function host({ hostName = '', isPublic = true, discoveryPort = LAN_DISCOVERY_PORT, basePort = LAN_PORT_BASE } = {}) {
    await leave();
    const ifaces = listLanInterfaces();
    const primary = ifaces[0];
    const selfId = crypto.randomBytes(32).toString('hex');
    const limiter = new PeerRateLimiter({ ratePerSec: 180, burst: 260, maxStrikes: 35 });
    const conns = new Map();
    const pendingSockets = new Set();

    const server = net.createServer();
    const cur = {
      isHost: true,
      selfId,
      conns,
      pendingSockets,
      limiter,
      server,
      udp: null,
      ip: primary.ip,
      port: basePort,
      code: '',
      meta: {
        hostName: String(hostName || '').slice(0, 24),
        isPublic: !!isPublic,
        inMatch: false,
        accepting: true,
        maxPlayers: 10,
      },
    };
    state = cur;

    server.on('connection', (socket) => {
      if (state !== cur) {
        try { socket.destroy(); } catch { /* ignore */ }
        return;
      }
      const remoteAddr = String(socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (remoteAddr && !isValidPrivateLanIp(remoteAddr)) {
        try { socket.destroy(); } catch { /* ignore */ }
        return;
      }
      attachSocketFraming(cur, socket, true);
    });

    let port;
    try {
      port = await listenOnPortRange(server, basePort, LAN_PORT_COUNT);
    } catch (err) {
      await leave();
      throw err;
    }

    cur.port = port;
    cur.code = encodeLanCode(primary.ip, port - basePort) || 'G127001';

    // Responder de descoberta UDP na sub-rede local (Salas Abertas / Partida Rapida sem internet).
    if (discoveryPort > 0) {
      try {
        const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        cur.udp = udp;
        const udpLimiter = new PeerRateLimiter({ ratePerSec: 20, burst: 30, maxStrikes: 100 });
        udp.on('error', () => { /* porta ocupada por outra instancia — TCP e codigo continuam funcionando */ });
        udp.on('message', (raw, rinfo) => {
          if (state !== cur || !rinfo || !isValidPrivateLanIp(rinfo.address)) return;
          if (!udpLimiter.allow(rinfo.address).allowed) return;
          if (raw.length > 512) return;
          let q;
          try { q = JSON.parse(raw.toString('utf8')); } catch { return; }
          if (!q || q.t !== 'fe-lan-ping') return;
          if (q.code && String(q.code).toUpperCase() !== cur.code) return;
          if (!q.code && !cur.meta.isPublic) return;

          const reply = Buffer.from(JSON.stringify({
            t: 'fe-lan-pong',
            code: cur.code,
            ip: cur.ip,
            port: cur.port,
            hostName: cur.meta.hostName,
            players: cur.conns.size + 1,
            max: cur.meta.maxPlayers,
            inMatch: !!cur.meta.inMatch,
            full: !cur.meta.accepting || cur.conns.size + 1 >= cur.meta.maxPlayers,
          }), 'utf8');
          try { udp.send(reply, rinfo.port, rinfo.address); } catch { /* ignore */ }
        });
        udp.bind(discoveryPort, '0.0.0.0');
      } catch {
        /* fallback silencioso se UDP 41229 estiver restrito */
      }
    }

    logLine(`lan host ativo em ${cur.ip}:${cur.port} (${cur.code})`);
    return {
      selfId,
      code: cur.code,
      ip: cur.ip,
      port: cur.port,
    };
  }

  function discover({ timeoutMs = 450, findCode = null, discoveryPort = LAN_DISCOVERY_PORT } = {}) {
    return new Promise((resolve) => {
      const rooms = new Map();
      let sock;
      try {
        sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      } catch {
        resolve([]);
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { sock.close(); } catch { /* ignore */ }
        resolve([...rooms.values()].sort((a, b) => (b.players || 0) - (a.players || 0)));
      };

      const timer = setTimeout(finish, Math.max(150, Math.min(2500, Number(timeoutMs) || 450)));

      sock.on('error', finish);
      sock.on('message', (raw, rinfo) => {
        if (!rinfo || !isValidPrivateLanIp(rinfo.address) || raw.length > 1024) return;
        let msg;
        try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
        if (!msg || msg.t !== 'fe-lan-pong' || typeof msg.code !== 'string') return;
        const port = Number(msg.port);
        if (!Number.isInteger(port) || port < LAN_PORT_BASE || port >= LAN_PORT_BASE + LAN_PORT_COUNT) return;
        const ip = isValidPrivateLanIp(msg.ip) ? msg.ip : rinfo.address;
        rooms.set(msg.code, {
          id: msg.code,
          code: msg.code,
          ip,
          port,
          players: Math.max(1, Math.min(16, Number(msg.players) || 1)),
          max: Math.max(2, Math.min(16, Number(msg.max) || 10)),
          inMatch: !!msg.inMatch,
          hostName: String(msg.hostName || '').slice(0, 24),
          full: !!msg.full,
          isLan: true,
        });
        if (findCode && msg.code.toUpperCase() === String(findCode).toUpperCase()) {
          finish();
        }
      });

      sock.bind(0, '0.0.0.0', () => {
        try { sock.setBroadcast(true); } catch { /* ignore */ }
        const payload = Buffer.from(JSON.stringify({
          t: 'fe-lan-ping',
          v: 1,
          code: findCode ? String(findCode).trim().toUpperCase() : undefined,
        }), 'utf8');

        const targets = new Set(['255.255.255.255', '127.0.0.1']);
        for (const iface of listLanInterfaces()) {
          if (iface.broadcast) targets.add(iface.broadcast);
        }
        for (const addr of targets) {
          try { sock.send(payload, discoveryPort, addr); } catch { /* ignore */ }
        }
      });
    });
  }

  async function join({ target, timeoutMs = 2200, discoveryPort = LAN_DISCOVERY_PORT } = {}) {
    await leave();
    let endpoint = parseLanTarget(String(target || ''));
    if (!endpoint) {
      const clean = String(target || '').trim().toUpperCase();
      if (clean) {
        const found = await discover({ timeoutMs: 550, findCode: clean, discoveryPort });
        if (found.length) {
          endpoint = { ip: found[0].ip, port: found[0].port, code: found[0].code };
        }
      }
    }
    if (!endpoint || !isValidPrivateLanIp(endpoint.ip)) {
      throw new Error('Endereco ou codigo LAN nao encontrado');
    }

    const selfId = crypto.randomBytes(32).toString('hex');
    const limiter = new PeerRateLimiter({ ratePerSec: 180, burst: 260, maxStrikes: 35 });
    const conns = new Map();
    const pendingSockets = new Set();
    const cur = {
      isHost: false,
      selfId,
      conns,
      pendingSockets,
      limiter,
      server: null,
      udp: null,
      ip: endpoint.ip,
      port: endpoint.port,
      code: endpoint.code || String(target || '').trim().toUpperCase(),
    };
    state = cur;

    await new Promise((resolve, reject) => {
      let settled = false;
      const socket = net.createConnection({ host: endpoint.ip, port: endpoint.port });
      const connectTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch { /* ignore */ }
        reject(new Error('Sem resposta TCP direta na rede local'));
      }, Math.max(500, Math.min(8000, Number(timeoutMs) || 2200)));

      socket.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        reject(err);
      });

      socket.once('connect', () => {
        attachSocketFraming(cur, socket, false, () => {
          if (settled) return;
          settled = true;
          clearTimeout(connectTimer);
          resolve();
        });
      });
    }).catch(async (err) => {
      await leave();
      throw err;
    });

    logLine(`lan conectado a ${endpoint.ip}:${endpoint.port} (${cur.code})`);
    return {
      selfId,
      code: cur.code,
      ip: endpoint.ip,
      port: endpoint.port,
    };
  }

  function updateMeta(patch = {}) {
    if (!state || !state.isHost || !state.meta) return;
    if (typeof patch.hostName === 'string') state.meta.hostName = patch.hostName.slice(0, 24);
    if (typeof patch.isPublic === 'boolean') state.meta.isPublic = patch.isPublic;
    if (typeof patch.inMatch === 'boolean') state.meta.inMatch = patch.inMatch;
    if (typeof patch.accepting === 'boolean') state.meta.accepting = patch.accepting;
    if (Number.isFinite(patch.maxPlayers)) state.meta.maxPlayers = Math.max(2, Math.min(16, Number(patch.maxPlayers)));
  }

  function send(key, msg) {
    if (!state || !isValidPeerKey(key)) return;
    const sock = state.conns.get(key);
    if (!sock) return;
    try {
      sock.write(frame(msg));
    } catch {
      /* pacote invalido ou socket encerrando */
    }
  }

  function closePeer(key) {
    if (!state || !isValidPeerKey(key)) return;
    const sock = state.conns.get(key);
    if (sock) {
      state.conns.delete(key);
      state.limiter.delete(key);
      try { sock.destroy(); } catch { /* ignore */ }
    }
  }

  return {
    host,
    join,
    discover,
    updateMeta,
    send,
    closePeer,
    leave,
    listLanInterfaces,
  };
}

module.exports = {
  createLanManager,
  listLanInterfaces,
};
