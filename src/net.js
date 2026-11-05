// Rede hibrida P2P do Fatal Error:
// 1. Modo Global (SwarmNet): Hyperswarm DHT + Noise Ed25519 + UDP hole-punching (sem servidor).
// 2. Modo Rede Interna / Corporativa GDFNet (GdfHybridNet = LanNet TCP/UDP + PeerNet WebRTC LAN):
//    - Prioriza conexao TCP direta na rede local (10.x.x.x / 192.168.x.x) + descoberta UDP na sub-rede,
//      funcionando 100% offline e entre VLANs pelo codigo de 8 letras (`Gxxxxxxx`) ou IP direto.
//    - Se o Firewall de Dominio do Windows bloquear porta TCP de entrada na maquina do Host,
//      faz fallback automatico imediato para WebRTC ICE direto por IP local (sem mDNS .local e sem
//      depender de servidores STUN/TURN externos bloqueados pelo proxy corporativo).

import { authorizeClientPacketOnHost, authorizePacketOnClient } from './security.js';

const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local)$/.test(location.hostname);
const PREFIX = LOCAL ? 'fatalerrordev-' : 'fatalerror-';
const LEGACY_PREFIX = 'doodledistrict-';
const PUBLIC_SLOTS = 12;
const GDF_PUBLIC_SLOTS = 8;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

const WAN_PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
};

// Na GDFNet / Rede Interna, servidores STUN/TURN externos sofrem timeout no firewall corporativo
// e atrasam o ICE. Com iceServers vazio + WebRtcHideLocalIpsWithMdns desativado no Electron,
// os dois PCs trocam candidatos host IPv4 (ex.: 10.63.30.x) instantaneamente e abrem UDP direto.
const LAN_PEER_OPTS = {
  debug: 0,
  config: { iceServers: [] },
};

const JOIN_TIMEOUT = 12000;
const QUICK_TIMEOUT = 8000;
const SIGNAL_TIMEOUT = 9000;

export function isLikelyLanCode(raw) {
  if (typeof raw !== 'string') return false;
  const s = raw.trim().toUpperCase();
  if (!s) return false;
  if (/^(GDF|LAN)-?[A-Z0-9]+$/.test(s)) return true;
  if (/^G[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}(-\d+)?$/.test(s)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?$/.test(s)) return true;
  return false;
}

function peerAvailable() {
  return typeof window !== 'undefined' && typeof window.Peer === 'function';
}
const idFromError = (err) => {
  const m = /peer\s+(\S+)/.exec(String(err && err.message || ''));
  return m ? m[1] : null;
};

// ---- PeerNet (WebRTC DataChannel via PeerJS) ----
class PeerNet {
  constructor() {
    this.peer = null;
    this.dirPeer = null;
    this.conns = new Map();
    this.isHost = false;
    this.id = null;
    this.logicalId = null; // Permite compartilhar o mesmo hostId do LanNet no modo hibrido GDFNet
    this.code = null;
    this.hostId = null;
    this._transportHostId = null;
    this.handlers = new Map();
    this.connected = false;
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onDisconnect = null;
    this.onAlias = null;
    this.maxPlayers = 10;
    this.accepting = true;
    this.hostName = '';
    this.stats = { sent: 0, recv: 0 };
    this.isPublic = false;
    this.isInternal = false;
    this.inMatch = false;
    this.alias = null;
    this.aliasCode = null;
    this._aliasTimer = null;
    this.extraCountFn = null;
  }

  get active() { return !!this.peer && this.connected; }
  get peerIds() { return [...this.conns.keys()]; }
  get effectiveId() { return this.logicalId || this.id; }
  _totalPlayers() {
    const extra = typeof this.extraCountFn === 'function' ? this.extraCountFn() : 0;
    return this.conns.size + extra + 1;
  }

  on(type, fn) { this.handlers.set(type, fn); }
  _emit(type, data, from) { const h = this.handlers.get(type); if (h) h(data, from); }

  _newPeer(id, isInternal = this.isInternal) {
    return new Promise((resolve, reject) => {
      if (!peerAvailable()) return reject(new Error('networking library did not load'));
      const peer = new window.Peer(id, isInternal ? LAN_PEER_OPTS : WAN_PEER_OPTS);
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { peer.destroy(); } catch { /* ignore */ }
          reject(new Error('signalling server timed out'));
        }
      }, SIGNAL_TIMEOUT);
      peer.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(peer);
      });
      peer.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { peer.destroy(); } catch { /* ignore */ }
        reject(err);
      });
    });
  }

  _wire(conn) {
    conn.on('data', (msg) => {
      this.stats.recv++;
      if (!msg || typeof msg !== 'object') return;
      this._route(msg, conn.peer);
    });
    conn.on('close', () => this._drop(conn.peer));
    conn.on('error', () => this._drop(conn.peer));
  }

  _drop(pid) {
    if (this.leaving || !this.conns.has(pid)) return;
    this.conns.delete(pid);
    if (this.isHost) {
      if (this.onPeerLeave) this.onPeerLeave(pid);
      this.broadcast('leave', { id: pid });
    } else if (pid === this._transportHostId || pid === this.hostId) {
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
    }
  }

  _route(msg, from) {
    if (this.isHost) {
      const auth = authorizeClientPacketOnHost(msg, from, this.effectiveId);
      if (auth.action === 'drop') return;
      if (auth.action === 'direct') {
        const c = this.conns.get(auth.to);
        if (c && c.open) c.send(auth.packet);
        else this._emit('__forward_direct', { to: auth.to, packet: auth.packet }, from);
        return;
      }
      if (auth.action === 'relay') {
        for (const [pid, c] of this.conns) if (pid !== from && c.open) c.send(auth.packet);
        this._emit('__forward_relay', { except: from, packet: auth.packet }, from);
      }
      this._emit(auth.packet.t, auth.packet.d, from);
      return;
    }
    const senderForAuth = (this._transportHostId && from === this._transportHostId) ? this.hostId : from;
    const auth = authorizePacketOnClient(msg, senderForAuth, this.hostId);
    if (!auth.allowed) return;
    this._emit(msg.t, msg.d, auth.from);
  }

  _keepAlive(peer) {
    peer.on('disconnected', () => {
      if ((this.peer === peer || this.dirPeer === peer) && !peer.destroyed) {
        try { peer.reconnect(); } catch { /* ignore */ }
      }
    });
  }

  async host({ isPublic = false, isInternal = false, publishDir = false, code = null, logicalId = null } = {}) {
    this.leave();
    this.isHost = true;
    this.isPublic = isPublic;
    this.isInternal = !!isInternal;
    this.logicalId = logicalId || null;

    if (code) {
      this.code = String(code).trim().toUpperCase();
      this.peer = await this._newPeer(PREFIX + this.code, this.isInternal);
    } else if (isPublic) {
      const slotPrefix = this.isInternal ? PREFIX + 'GDFPUB' : PREFIX + 'PUB';
      const total = this.isInternal ? GDF_PUBLIC_SLOTS : PUBLIC_SLOTS;
      for (let slot = 0; slot < total; slot++) {
        try {
          const shortCode = (this.isInternal ? 'GDFPUB' : 'PUB') + slot;
          this.peer = await this._newPeer(slotPrefix + slot, this.isInternal);
          this.code = shortCode;
          break;
        } catch (e) {
          if (!(e && e.type === 'unavailable-id')) throw e;
        }
      }
      if (!this.peer) throw new Error('all public lobbies are busy - host a private one');
    } else {
      for (let tries = 0; tries < 3 && !this.peer; tries++) {
        this.code = makeCode();
        try {
          this.peer = await this._newPeer(PREFIX + this.code, this.isInternal);
        } catch (e) {
          if (!(e && e.type === 'unavailable-id') || tries === 2) throw e;
        }
      }
    }

    this.id = this.peer.id;
    this.hostId = this.effectiveId;
    this.connected = true;
    this.accepting = true;
    this.peer.on('connection', (conn) => this._incoming(conn));
    this._keepAlive(this.peer);

    // Publica tambem num slot de diretorio GDFPUB0..7 em segundo plano para aparecer em "Salas Abertas"
    if (publishDir) {
      this._claimGdfDirectorySlot().catch(() => {});
    }
    return this.code;
  }

  async _claimGdfDirectorySlot() {
    for (let slot = 0; slot < GDF_PUBLIC_SLOTS; slot++) {
      if (!this.isHost || !this.connected) return;
      try {
        const dp = await this._newPeer(PREFIX + 'GDFPUB' + slot, true);
        if (!this.isHost || !this.connected) {
          try { dp.destroy(); } catch { /* ignore */ }
          return;
        }
        this.dirPeer = dp;
        dp.on('connection', (conn) => this._incoming(conn));
        this._keepAlive(dp);
        return;
      } catch (e) {
        if (!(e && e.type === 'unavailable-id')) return;
      }
    }
  }

  _incoming(conn) {
    const onOpen = () => {
      const total = this._totalPlayers();
      if (!this.accepting || total > this.maxPlayers) {
        conn.send({
          t: 'refused',
          d: {
            reason: this.accepting ? 'that lobby is full' : 'that lobby is closed',
            code: this.aliasCode || this.code,
            players: total,
            max: this.maxPlayers,
            inMatch: !!this.inMatch,
            hostName: this.hostName,
            isLan: this.isInternal,
          },
        });
        setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 600);
        return;
      }

      const seat = (joinMeta) => {
        if (this.conns.has(conn.peer)) return;
        this.conns.set(conn.peer, conn);
        this._wire(conn);
        if (this.onPeerJoin) this.onPeerJoin(conn.peer, joinMeta || conn.metadata || {});
      };

      const welcome = {
        hostId: this.effectiveId,
        code: this.aliasCode || this.code,
        isPublic: this.isPublic || !!this.dirPeer,
        isLan: this.isInternal,
        players: total,
        max: this.maxPlayers,
        inMatch: !!this.inMatch,
        hostName: this.hostName,
      };

      if (conn.metadata && conn.metadata.probe) {
        conn.send({ t: 'welcome', d: welcome, from: this.effectiveId });
        const onData = (msg) => {
          if (msg && msg.t === 'stay') {
            conn.off('data', onData);
            seat(conn.metadata);
          }
        };
        conn.on('data', onData);
      } else {
        conn.send({ t: 'welcome', d: welcome, from: this.effectiveId });
        seat(conn.metadata);
      }
    };

    if (conn.open) onOpen();
    else conn.once('open', onOpen);
  }

  claimAlias(code, tries = 20) {
    if (!this.isHost || this.alias || this._aliasTimer) return;
    const attempt = async () => {
      this._aliasTimer = null;
      if (!this.isHost || this.alias) return;
      try {
        const peer = await this._newPeer(PREFIX + code, this.isInternal);
        if (!this.isHost) { peer.destroy(); return; }
        this.alias = peer;
        this.aliasCode = code;
        peer.on('connection', (conn) => this._incoming(conn));
        if (this.onAlias) this.onAlias(code);
      } catch {
        if (--tries > 0) this._aliasTimer = setTimeout(attempt, 6000);
      }
    };
    this._aliasTimer = setTimeout(attempt, 1500);
  }

  async join(code, meta = {}) {
    this.leave();
    this.isHost = false;
    this.isInternal = !!(meta.isInternal || meta.mode === 'lan' || isLikelyLanCode(code));
    code = String(code || '').trim().toUpperCase().replace(/^(GDF-|LAN-)/, '');
    if (!code) throw new Error('enter a lobby code');

    this.peer = await this._newPeer(null, this.isInternal);
    this.id = this.peer.id;
    this._keepAlive(this.peer);

    const base = code.replace(/-\d+$/, '');
    const variants = [code, ...['-1', '-2', '-3'].map((suf) => base + suf).filter((c) => c !== code)];
    const ids = [];
    for (const v of variants) {
      ids.push(PREFIX + v);
      if (v.length <= 7) ids.push(LEGACY_PREFIX + v);
    }

    let res;
    try {
      res = await this._knockAny(ids, meta, JOIN_TIMEOUT);
    } catch (e) {
      this.leave();
      throw e;
    }
    const { hostId, conn, welcome, earlyMsgs } = res;
    this._adopt(hostId, conn, welcome, earlyMsgs);
    this.code = (welcome && welcome.code) || hostId.replace(/^[^-]+-/, '');
    return this.code;
  }

  async quickJoin(meta = {}, onStatus = null) {
    this.leave();
    this.isHost = false;
    this.isInternal = !!(meta.isInternal || meta.mode === 'lan');
    this.peer = await this._newPeer(null, this.isInternal);
    this.id = this.peer.id;
    this._keepAlive(this.peer);
    if (onStatus) onStatus('Procurando salas abertas…');

    const ids = [];
    for (let i = 0; i < GDF_PUBLIC_SLOTS; i++) ids.push(PREFIX + 'GDFPUB' + i);
    for (let i = 0; i < PUBLIC_SLOTS; i++) for (const suf of ['', '-1', '-2']) ids.push(PREFIX + 'PUB' + i + suf);

    const winner = await new Promise((resolve) => {
      let pending = ids.length, done = false;
      const attempts = [], offers = [];
      let gather = null;
      const pick = () => {
        if (!offers.length) return null;
        offers.sort((a, b) => (b.welcome.players || 0) - (a.welcome.players || 0));
        return offers[0];
      };
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(gather);
        this.peer.off('error', onErr);
        const val = pick();
        for (const a of attempts) {
          if (!val || a.conn !== val.conn) {
            try { a.conn.close(); } catch { /* ignore */ }
          }
        }
        resolve(val);
      };
      const failOne = (a) => {
        if (a.done) return;
        a.done = true;
        pending--;
        if (pending <= 0) settle();
      };
      const onErr = (err) => {
        if (err && err.type === 'peer-unavailable') {
          const a = attempts.find((x) => x.hostId === idFromError(err));
          if (a) failOne(a);
        }
      };
      this.peer.on('error', onErr);
      const timer = setTimeout(settle, QUICK_TIMEOUT);
      const probeMeta = { ...meta, probe: true };
      for (const hostId of ids) {
        let conn;
        try { conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: probeMeta }); }
        catch { pending--; continue; }
        const a = { conn, hostId, done: false, earlyMsgs: [] };
        attempts.push(a);
        const onData = (msg) => {
          if (!msg) return;
          if (!a.done) {
            if (msg.t === 'welcome') {
              a.done = true;
              pending--;
              offers.push({ conn, hostId, welcome: msg.d, earlyMsgs: a.earlyMsgs, onData });
              if (onStatus) onStatus(`Encontradas ${offers.length} salas abertas…`);
              if (pending <= 0) settle();
              else if (!gather) gather = setTimeout(settle, 1200);
            } else if (msg.t === 'refused') {
              failOne(a);
            }
          } else {
            a.earlyMsgs.push(msg);
          }
        };
        conn.on('data', onData);
        conn.on('error', () => failOne(a));
        conn.on('close', () => failOne(a));
      }
      if (pending <= 0) settle();
    });

    if (!winner) {
      this.leave();
      throw new Error('no open public lobbies');
    }
    winner.conn.off('data', winner.onData);
    winner.conn.send({ t: 'stay' });
    this._adopt(winner.hostId, winner.conn, winner.welcome, winner.earlyMsgs);
    this.code = (winner.welcome && winner.welcome.code) || winner.hostId.slice(PREFIX.length);
    return this.code;
  }

  async listLobbies(meta = {}, onStatus = null) {
    if (this.active) throw new Error('leave the lobby first');
    const peer = await this._newPeer(null, true);
    const ids = [];
    for (let i = 0; i < GDF_PUBLIC_SLOTS; i++) ids.push(PREFIX + 'GDFPUB' + i);
    for (let i = 0; i < PUBLIC_SLOTS; i++) ids.push(PREFIX + 'PUB' + i);

    const found = await new Promise((resolve) => {
      let pending = ids.length, done = false;
      const attempts = [], offers = [];
      let gather = null;
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(gather);
        peer.off('error', onErr);
        for (const a of attempts) {
          try { a.conn.close(); } catch { /* ignore */ }
        }
        resolve(offers);
      };
      const failOne = (a) => {
        if (a.done) return;
        a.done = true;
        pending--;
        if (pending <= 0) settle();
      };
      const onErr = (err) => {
        if (err && err.type === 'peer-unavailable') {
          const a = attempts.find((x) => x.hostId === idFromError(err));
          if (a) failOne(a);
        }
      };
      peer.on('error', onErr);
      const timer = setTimeout(settle, QUICK_TIMEOUT);
      const probeMeta = { ...meta, probe: true };
      for (const hostId of ids) {
        let conn;
        try { conn = peer.connect(hostId, { reliable: true, serialization: 'json', metadata: probeMeta }); }
        catch { pending--; continue; }
        const a = { conn, hostId, done: false };
        attempts.push(a);
        conn.on('data', (msg) => {
          if (!msg || a.done) return;
          if (msg.t === 'welcome' || msg.t === 'refused') {
            a.done = true;
            pending--;
            const d = msg.d || {};
            const isLanSlot = hostId.includes('GDFPUB') || !!d.isLan;
            offers.push({
              id: d.code || hostId.slice(PREFIX.length),
              code: d.code || hostId.slice(PREFIX.length),
              players: d.players || 0,
              max: d.max || 10,
              inMatch: !!d.inMatch,
              hostName: d.hostName || '',
              full: msg.t === 'refused',
              isLan: isLanSlot,
            });
            if (onStatus) onStatus(`Encontradas ${offers.length} salas…`);
            if (pending <= 0) settle();
            else if (!gather) gather = setTimeout(settle, 1500);
          }
        });
        conn.on('error', () => failOne(a));
        conn.on('close', () => failOne(a));
      }
      if (pending <= 0) settle();
    });

    try { peer.destroy(); } catch { /* ignore */ }
    const byCode = new Map();
    for (const o of found) {
      const k = String(o.code || '').replace(/-\d+$/, '');
      const prev = byCode.get(k);
      if (!prev || o.players > prev.players) byCode.set(k, { ...o, code: k });
    }
    return [...byCode.values()].sort((a, b) => b.players - a.players);
  }

  _knockAny(ids, meta, timeoutMs) {
    return new Promise((resolve, reject) => {
      let pending = ids.length, done = false, lastErr = null;
      const attempts = [];
      const finish = (err, val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.peer.off('error', onErr);
        for (const a of attempts) {
          if (!val || a.conn !== val.conn) {
            try { a.conn.close(); } catch { /* ignore */ }
          } else if (a.onData) {
            a.conn.off('data', a.onData);
          }
        }
        if (val) resolve(val);
        else reject(err || new Error('no lobby with that code'));
      };
      const failOne = (a, err) => {
        if (a.done) return;
        a.done = true;
        if (err && !/no lobby/.test(String(err.message))) lastErr = err;
        pending--;
        if (pending <= 0) finish(lastErr || new Error('no lobby with that code'));
      };
      const onErr = (err) => {
        if (err && err.type === 'peer-unavailable') {
          const a = attempts.find((x) => x.hostId === idFromError(err));
          if (a) failOne(a, new Error('no lobby with that code'));
        }
      };
      this.peer.on('error', onErr);
      const timer = setTimeout(() => finish(new Error('no answer from that lobby')), timeoutMs);

      for (const hostId of ids) {
        let conn;
        try { conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: meta }); }
        catch { pending--; continue; }
        const a = { conn, hostId, done: false, welcomed: false, earlyMsgs: [], onData: null };
        attempts.push(a);
        a.onData = (msg) => {
          if (!msg) return;
          if (!a.welcomed) {
            if (msg.t === 'welcome') {
              a.welcomed = true;
              a.done = true;
              finish(null, { hostId, conn, welcome: msg.d, earlyMsgs: a.earlyMsgs });
            } else if (msg.t === 'refused') {
              failOne(a, new Error(msg.d && msg.d.reason || 'the lobby turned you away'));
            }
          } else {
            a.earlyMsgs.push(msg);
          }
        };
        conn.on('data', a.onData);
        conn.on('error', (e) => failOne(a, e instanceof Error ? e : new Error('could not connect')));
        conn.on('close', () => failOne(a, null));
      }
      if (pending <= 0) finish(lastErr || new Error('no lobby with that code'));
    });
  }

  _adopt(transportHostId, conn, welcome, earlyMsgs = []) {
    this._transportHostId = transportHostId;
    this.hostId = (welcome && welcome.hostId) || transportHostId;
    this.conns.set(transportHostId, conn);
    this.connected = true;
    this.isPublic = !!(welcome && welcome.isPublic);
    this.isInternal = !!(welcome && welcome.isLan) || this.isInternal;
    this._wire(conn);
    for (const m of earlyMsgs) {
      if (m && typeof m === 'object') this._route(m, transportHostId);
    }
  }

  leave() {
    this.leaving = true;
    clearTimeout(this._aliasTimer);
    this._aliasTimer = null;
    if (this.alias) { try { this.alias.destroy(); } catch { /* ignore */ } }
    if (this.dirPeer) { try { this.dirPeer.destroy(); } catch { /* ignore */ } }
    this.alias = null;
    this.dirPeer = null;
    this.aliasCode = null;
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear();
    if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } }
    this.peer = null;
    this.connected = false;
    this.isHost = false;
    this.id = null;
    this.logicalId = null;
    this.code = null;
    this.hostId = null;
    this._transportHostId = null;
    this.leaving = false;
  }

  send(type, data, relay = false) {
    this.stats.sent++;
    if (this.isHost) {
      const m = { t: type, d: data, from: this.effectiveId };
      for (const c of this.conns.values()) if (c.open) c.send(m);
    } else {
      const c = this.conns.get(this._transportHostId || this.hostId);
      if (c && c.open) c.send({ t: type, d: data, relay });
    }
  }

  broadcast(type, data) { this.send(type, data, true); }

  sendTo(pid, type, data) {
    this.stats.sent++;
    if (this.isHost) {
      const c = this.conns.get(pid);
      if (c && c.open) { c.send({ t: type, d: data, from: this.effectiveId }); return true; }
      return false;
    }
    const c = this.conns.get(this._transportHostId || this.hostId);
    if (c && c.open) { c.send({ t: type, d: data, to: pid, from: this.id }); return true; }
    return false;
  }
}

// ---- BridgeNet: base compartilhada para SwarmNet (Hyperswarm) e LanNet (TCP/UDP nativo) ----
class BridgeNet {
  constructor(bridge, joinTimeoutMs = 20000) {
    this.bridge = bridge;
    this.joinTimeoutMs = joinTimeoutMs;
    this.conns = new Map();
    this.isHost = false;
    this.id = null;
    this.code = null;
    this.hostId = null;
    this.lanAddress = null;
    this.handlers = new Map();
    this.connected = false;
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onDisconnect = null;
    this.onAlias = null;
    this.maxPlayers = 10;
    this.accepting = true;
    this.hostName = '';
    this.stats = { sent: 0, recv: 0 };
    this.isPublic = false;
    this.aliasCode = null;
    this.inMatch = false;
    this.extraCountFn = null;
    this._pendingJoin = null;
    this._joinMeta = null;

    this.bridge.onConnect((key) => this._onConnect(key));
    this.bridge.onData((key, msg) => this._onData(key, msg));
    this.bridge.onDisconnect((key) => this._onDisconnect(key));
  }

  get active() { return this.connected; }
  get peerIds() { return [...this.conns.keys()]; }
  _totalPlayers() {
    const extra = typeof this.extraCountFn === 'function' ? this.extraCountFn() : 0;
    return this.conns.size + extra + 1;
  }

  on(type, fn) { this.handlers.set(type, fn); }
  _emit(type, data, from) { const h = this.handlers.get(type); if (h) h(data, from); }
  _wrap(key) {
    return {
      open: true,
      send: (m) => { this.stats.sent++; this.bridge.send(key, m); },
      close: () => { if (this.bridge.closePeer) this.bridge.closePeer(key); },
    };
  }

  _onConnect(key) {
    if (!this.isHost && !this.connected) {
      this.bridge.send(key, { t: 'hello', d: this._joinMeta || {}, from: this.id });
    }
  }

  _onData(key, msg) {
    this.stats.recv++;
    if (!msg || typeof msg !== 'object') return;
    if (this.isHost) {
      if (msg.t === 'hello') {
        const total = this._totalPlayers();
        if (!this.accepting || total >= this.maxPlayers) {
          this.bridge.send(key, {
            t: 'refused',
            d: {
              reason: this.accepting ? 'that lobby is full' : 'that lobby is closed',
              code: this.code,
              players: total,
              max: this.maxPlayers,
              inMatch: !!this.inMatch,
              hostName: this.hostName,
            },
            from: this.id,
          });
          return;
        }
        const isNew = !this.conns.has(key);
        if (isNew) this.conns.set(key, this._wrap(key));
        this.bridge.send(key, {
          t: 'welcome',
          d: {
            hostId: this.id,
            code: this.code,
            isPublic: this.isPublic,
            players: this._totalPlayers(),
            max: this.maxPlayers,
            inMatch: !!this.inMatch,
            hostName: this.hostName,
          },
          from: this.id,
        });
        if (isNew && this.onPeerJoin) this.onPeerJoin(key, msg.d || {});
        return;
      }
      if (!this.conns.has(key)) return;
      const auth = authorizeClientPacketOnHost(msg, key, this.id);
      if (auth.action === 'drop') return;
      if (auth.action === 'direct') {
        const w = this.conns.get(auth.to);
        if (w) w.send(auth.packet);
        else this._emit('__forward_direct', { to: auth.to, packet: auth.packet }, key);
        return;
      }
      if (auth.action === 'relay') {
        for (const [pid, w] of this.conns) if (pid !== key) w.send(auth.packet);
        this._emit('__forward_relay', { except: key, packet: auth.packet }, key);
      }
      this._emit(auth.packet.t, auth.packet.d, key);
    } else {
      if (msg.t === 'welcome') {
        if (this.connected && this.hostId && key !== this.hostId) return;
        this.hostId = key;
        this.conns.set(key, this._wrap(key));
        this.connected = true;
        this.isPublic = !!(msg.d && msg.d.isPublic);
        this.code = (msg.d && msg.d.code) || this.code;
        if (this._pendingJoin) {
          clearTimeout(this._pendingJoin.timer);
          this._pendingJoin.resolve(this.code);
          this._pendingJoin = null;
        }
        return;
      }
      if (msg.t === 'refused') {
        if (this.connected) return;
        if (this._pendingJoin) {
          clearTimeout(this._pendingJoin.timer);
          this._pendingJoin.reject(new Error(msg.d && msg.d.reason || 'the lobby turned you away'));
          this._pendingJoin = null;
        }
        return;
      }
      const auth = authorizePacketOnClient(msg, key, this.hostId);
      if (!auth.allowed) return;
      this._emit(msg.t, msg.d, auth.from);
    }
  }

  _onDisconnect(key) {
    const had = this.conns.has(key);
    this.conns.delete(key);
    if (this.isHost) {
      if (had) {
        if (this.onPeerLeave) this.onPeerLeave(key);
        this.broadcast('leave', { id: key });
      }
    } else if (key === this.hostId) {
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
    }
  }

  async leave() {
    if (this._pendingJoin) {
      clearTimeout(this._pendingJoin.timer);
      this._pendingJoin = null;
    }
    this.conns.clear();
    this.connected = false;
    this.isHost = false;
    this.id = null;
    this.code = null;
    this.hostId = null;
    this.lanAddress = null;
    try { await this.bridge.leave(); } catch { /* ignore */ }
  }

  send(type, data, relay = false) {
    this.stats.sent++;
    if (this.isHost) {
      const m = { t: type, d: data, from: this.id };
      for (const w of this.conns.values()) w.send(m);
    } else {
      const w = this.conns.get(this.hostId);
      if (w) w.send({ t: type, d: data, relay });
    }
  }

  broadcast(type, data) { this.send(type, data, true); }

  sendTo(pid, type, data) {
    this.stats.sent++;
    if (this.isHost) {
      const w = this.conns.get(pid);
      if (w) { w.send({ t: type, d: data, from: this.id }); return true; }
      return false;
    }
    const w = this.conns.get(this.hostId);
    if (w) { w.send({ t: type, d: data, to: pid, from: this.id }); return true; }
    return false;
  }
}

class SwarmNet extends BridgeNet {
  constructor() {
    super(window.FE_NET, 20000);
  }
  async host({ isPublic = false, code = null } = {}) {
    await this.leave();
    this.isHost = true;
    this.isPublic = isPublic;
    this.code = code ? String(code).toUpperCase() : (isPublic ? 'PUBLIC' : makeCode());
    this.id = await this.bridge.host(this.code);
    this.hostId = this.id;
    this.connected = true;
    this.accepting = true;
    return this.code;
  }
  async join(code, meta = {}) {
    await this.leave();
    this.isHost = false;
    code = String(code || '').trim().toUpperCase();
    if (!code) throw new Error('enter a lobby code');
    this.code = code;
    this._joinMeta = { ...meta };
    this.id = await this.bridge.join(code);
    for (const key of this.conns.keys()) {
      this.bridge.send(key, { t: 'hello', d: this._joinMeta, from: this.id });
    }
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingJoin = null;
        this.leave();
        reject(new Error('no answer from that lobby'));
      }, this.joinTimeoutMs);
      this._pendingJoin = { resolve, reject, timer };
    });
  }
  async quickJoin(meta = {}, onStatus = null) {
    if (onStatus) onStatus('Procurando sala pública…');
    try { return await this.join('PUBLIC', meta); }
    catch {
      if (onStatus) onStatus('Nenhuma sala aberta · criando uma nova…');
      return await this.host({ isPublic: true, code: 'PUBLIC' });
    }
  }
  async listLobbies() { return []; }
  claimAlias() {}
}

class LanNet extends BridgeNet {
  constructor() {
    super(window.FE_LAN, 2500);
  }
  _syncMeta() {
    if (this.isHost && this.connected && this.bridge.updateMeta) {
      this.bridge.updateMeta({
        hostName: this.hostName,
        isPublic: this.isPublic,
        inMatch: !!this.inMatch,
        accepting: !!this.accepting,
        maxPlayers: this.maxPlayers,
      });
    }
  }
  async host({ isPublic = true } = {}) {
    await this.leave();
    this.isHost = true;
    this.isPublic = isPublic !== false;
    const info = await this.bridge.host({ hostName: this.hostName, isPublic: this.isPublic });
    this.id = info.selfId;
    this.hostId = this.id;
    this.code = info.code;
    this.lanAddress = info.port === 41230 ? info.ip : `${info.ip}:${info.port}`;
    this.connected = true;
    this.accepting = true;
    this._syncMeta();
    return this.code;
  }
  async join(target, meta = {}, timeoutMs = 1900) {
    await this.leave();
    this.isHost = false;
    const clean = String(target || '').trim();
    if (!clean) throw new Error('enter a lobby code');
    this._joinMeta = { ...meta };
    const info = await this.bridge.join(clean, timeoutMs);
    this.id = info.selfId;
    this.code = info.code;
    for (const key of this.conns.keys()) {
      this.bridge.send(key, { t: 'hello', d: this._joinMeta, from: this.id });
    }
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingJoin = null;
        this.leave();
        reject(new Error('no answer from that lobby'));
      }, 3000);
      this._pendingJoin = { resolve, reject, timer };
    });
  }
  async discover(timeoutMs = 450) {
    if (!this.bridge.discover) return [];
    try { return await this.bridge.discover(timeoutMs); }
    catch { return []; }
  }
  claimAlias() {}
}

// ---- GdfHybridNet: combina LanNet (TCP/UDP nativo) + PeerNet (WebRTC IP local) na mesma sala! ----
// Se o colega alcancar a porta TCP 41230 do Host, conecta em ~1 ms sem internet.
// Se o Firewall de Dominio bloquear TCP de entrada no Host, conecta via WebRTC UDP direto (sem mDNS).
class GdfHybridNet {
  constructor(lan, peer) {
    this.lan = lan;
    this.peer = peer;
    this.activeClient = null; // No modo cliente, guarda qual sub-driver venceu ('lan' | 'peer')
    this.isHost = false;
    this._inMatch = false;
    this._accepting = true;
    this._hostName = '';
    this._isPublic = true;
    this._maxPlayers = 10;

    if (this.lan && this.peer) {
      this.lan.extraCountFn = () => (this.isHost && this.peer.active ? this.peer.conns.size : 0);
      this.peer.extraCountFn = () => (this.isHost && this.lan.active ? this.lan.conns.size : 0);

      // Ponte cruzada no Host: pacotes relay/direct de um cliente TCP chegam aos clientes WebRTC e vice-versa!
      this.lan.on('__forward_direct', ({ to, packet }) => {
        if (this.isHost && this.peer.active) {
          const c = this.peer.conns.get(to);
          if (c && c.open) c.send(packet);
        }
      });
      this.lan.on('__forward_relay', ({ packet }) => {
        if (this.isHost && this.peer.active) {
          for (const c of this.peer.conns.values()) if (c.open) c.send(packet);
        }
      });
      this.peer.on('__forward_direct', ({ to, packet }) => {
        if (this.isHost && this.lan.active) {
          const w = this.lan.conns.get(to);
          if (w) w.send(packet);
        }
      });
      this.peer.on('__forward_relay', ({ packet }) => {
        if (this.isHost && this.lan.active) {
          for (const w of this.lan.conns.values()) w.send(packet);
        }
      });
    }
  }

  get active() {
    if (this.isHost) return (this.lan && this.lan.active) || this.peer.active;
    return this.activeClient ? this.activeClient.active : false;
  }
  get conns() {
    if (this.isHost) {
      const merged = new Map();
      if (this.lan && this.lan.active) for (const [k, v] of this.lan.conns) merged.set(k, v);
      if (this.peer.active) for (const [k, v] of this.peer.conns) merged.set(k, v);
      return merged;
    }
    return this.activeClient ? this.activeClient.conns : new Map();
  }
  get peerIds() { return [...this.conns.keys()]; }
  get id() {
    if (this.isHost) return (this.lan && this.lan.active) ? this.lan.id : this.peer.effectiveId;
    return this.activeClient ? this.activeClient.id : null;
  }
  get code() {
    if (this.isHost) return (this.lan && this.lan.active) ? this.lan.code : this.peer.code;
    return this.activeClient ? this.activeClient.code : null;
  }
  get hostId() {
    if (this.isHost) return this.id;
    return this.activeClient ? this.activeClient.hostId : null;
  }
  get lanAddress() {
    return (this.isHost && this.lan && this.lan.active) ? this.lan.lanAddress : null;
  }
  get aliasCode() {
    return this.peer.aliasCode || null;
  }
  get isPublic() { return this._isPublic; }
  set isPublic(v) {
    this._isPublic = !!v;
    if (this.lan) { this.lan.isPublic = !!v; this.lan._syncMeta(); }
    this.peer.isPublic = !!v;
  }
  get inMatch() { return this._inMatch; }
  set inMatch(v) {
    this._inMatch = !!v;
    if (this.lan) { this.lan.inMatch = !!v; this.lan._syncMeta(); }
    this.peer.inMatch = !!v;
  }
  get accepting() { return this._accepting; }
  set accepting(v) {
    this._accepting = !!v;
    if (this.lan) { this.lan.accepting = !!v; this.lan._syncMeta(); }
    this.peer.accepting = !!v;
  }
  get maxPlayers() { return this._maxPlayers; }
  set maxPlayers(v) {
    this._maxPlayers = v;
    if (this.lan) { this.lan.maxPlayers = v; this.lan._syncMeta(); }
    this.peer.maxPlayers = v;
  }
  get hostName() { return this._hostName; }
  set hostName(v) {
    this._hostName = v;
    if (this.lan) { this.lan.hostName = v; this.lan._syncMeta(); }
    this.peer.hostName = v;
  }

  async host(opts = {}) {
    await this.leave();
    this.isHost = true;
    this._isPublic = opts.isPublic !== false;

    if (this.lan) {
      this.lan.hostName = this._hostName;
      const lanCode = await this.lan.host({ isPublic: this._isPublic });
      // Abre tambem o espelho WebRTC local (PeerJS sem STUN/TURN externos) em paralelo:
      // se o firewall da maquina bloquear TCP 41230 de entrada, o colega entra pelo WebRTC UDP!
      this.peer.hostName = this._hostName;
      this.peer.host({
        isPublic: false,
        isInternal: true,
        publishDir: true,
        code: opts.code || lanCode,
        logicalId: this.lan.id,
      }).catch(() => {
        /* sem internet / PeerJS bloqueado: LanNet TCP + UDP Discovery seguem operando normalmente */
      });
      return opts.code || lanCode;
    }

    this.peer.hostName = this._hostName;
    return await this.peer.host({
      isPublic: false,
      isInternal: true,
      publishDir: true,
      code: opts.code || null,
    });
  }

  async join(code, meta = {}) {
    await this.leave();
    this.isHost = false;
    const raw = String(code || '').trim();
    if (!raw) throw new Error('enter a lobby code');

    let lanErr = null;
    if (this.lan) {
      try {
        const joinedCode = await this.lan.join(raw, meta, 1900);
        this.activeClient = this.lan;
        return joinedCode;
      } catch (err) {
        lanErr = err;
      }
    }

    // Se for apenas IP puro (ex.: 10.63.30.10) e o TCP falhou, nao ha codigo PeerJS correspondente
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?$/.test(raw)) {
      throw lanErr || new Error('no answer from that lobby');
    }

    const joinedPeerCode = await this.peer.join(raw, { ...meta, isInternal: true, mode: 'lan' });
    this.activeClient = this.peer;
    return joinedPeerCode;
  }

  async quickJoin(meta = {}, onStatus = null) {
    await this.leave();
    this.isHost = false;
    if (this.lan) {
      if (onStatus) onStatus('Buscando salas na rede local (GDFNet)…');
      const localRooms = await this.lan.discover(500);
      const openRoom = localRooms.find((r) => !r.full);
      if (openRoom) {
        try {
          const c = await this.lan.join(openRoom.code, meta, 1900);
          this.activeClient = this.lan;
          return c;
        } catch {
          /* tenta WebRTC abaixo */
        }
      }
    }
    const c = await this.peer.quickJoin({ ...meta, isInternal: true, mode: 'lan' }, onStatus);
    this.activeClient = this.peer;
    return c;
  }

  claimAlias(code, tries) {
    this.peer.claimAlias(code, tries);
  }

  async leave() {
    this.activeClient = null;
    this.isHost = false;
    this.peer.leave();
    if (this.lan) await this.lan.leave();
  }

  send(type, data, relay = false) {
    if (this.isHost) {
      if (this.lan && this.lan.active) this.lan.send(type, data, relay);
      if (this.peer.active) this.peer.send(type, data, relay);
    } else if (this.activeClient) {
      this.activeClient.send(type, data, relay);
    }
  }

  broadcast(type, data) { this.send(type, data, true); }

  sendTo(pid, type, data) {
    if (this.isHost) {
      if (this.lan && this.lan.active && this.lan.sendTo(pid, type, data)) return;
      if (this.peer.active) this.peer.sendTo(pid, type, data);
    } else if (this.activeClient) {
      this.activeClient.sendTo(pid, type, data);
    }
  }
}

// ---- DualNet: orquestra Global P2P (Hyperswarm) e Rede Interna Corporativa (GDFNet) ----
export class DualNet {
  constructor() {
    this.swarm = (typeof window !== 'undefined' && window.FE_NET) ? new SwarmNet() : null;
    this.lan = (typeof window !== 'undefined' && window.FE_LAN) ? new LanNet() : null;
    this.peer = new PeerNet();
    this.gdf = new GdfHybridNet(this.lan, this.peer);
    this.driver = this.swarm || this.gdf;
    this.mode = this.swarm ? 'swarm' : 'gdf';
    this.isInternal = !this.swarm;
  }

  usePeer(isLan = true) {
    this.isInternal = !!isLan;
    if (isLan || !this.swarm) {
      this.driver = this.gdf;
      this.mode = 'gdf';
    } else {
      this.driver = this.swarm;
      this.mode = 'swarm';
    }
    return this.driver;
  }

  get active() { return this.driver.active; }
  get peerIds() { return this.driver.peerIds; }
  get conns() { return this.driver.conns || new Map(); }
  get id() { return this.driver.id; }
  get code() { return this.driver.code; }
  get hostId() { return this.driver.hostId; }
  get isHost() { return this.driver.isHost; }
  get lanAddress() { return this.driver.lanAddress || null; }
  get isPublic() { return this.driver.isPublic; }
  set isPublic(v) { this.gdf.isPublic = v; if (this.swarm) this.swarm.isPublic = v; }
  get inMatch() { return this.driver.inMatch; }
  set inMatch(v) { this.gdf.inMatch = v; if (this.swarm) this.swarm.inMatch = v; }
  get accepting() { return this.driver.accepting; }
  set accepting(v) { this.gdf.accepting = v; if (this.swarm) this.swarm.accepting = v; }
  get maxPlayers() { return this.driver.maxPlayers; }
  set maxPlayers(v) { this.gdf.maxPlayers = v; if (this.swarm) this.swarm.maxPlayers = v; }
  get hostName() { return this.driver.hostName; }
  set hostName(v) { this.gdf.hostName = v; if (this.swarm) this.swarm.hostName = v; }
  get aliasCode() { return this.driver.aliasCode; }

  set onPeerJoin(fn) {
    this.peer.onPeerJoin = fn;
    if (this.lan) this.lan.onPeerJoin = fn;
    if (this.swarm) this.swarm.onPeerJoin = fn;
  }
  set onPeerLeave(fn) {
    this.peer.onPeerLeave = fn;
    if (this.lan) this.lan.onPeerLeave = fn;
    if (this.swarm) this.swarm.onPeerLeave = fn;
  }
  set onDisconnect(fn) {
    this.peer.onDisconnect = fn;
    if (this.lan) this.lan.onDisconnect = fn;
    if (this.swarm) this.swarm.onDisconnect = fn;
  }
  set onAlias(fn) {
    this.peer.onAlias = fn;
    if (this.lan) this.lan.onAlias = fn;
    if (this.swarm) this.swarm.onAlias = fn;
  }

  on(type, fn) {
    this.peer.on(type, fn);
    if (this.lan) this.lan.on(type, fn);
    if (this.swarm) this.swarm.on(type, fn);
  }

  send(type, data, relay = false) { return this.driver.send(type, data, relay); }
  broadcast(type, data) { return this.driver.broadcast(type, data); }
  sendTo(pid, type, data) { return this.driver.sendTo(pid, type, data); }

  async host(opts = {}) {
    if (opts.mode === 'lan' || opts.isInternal) {
      this.usePeer(true);
      return await this.gdf.host({ ...opts, isPublic: true });
    }
    this.usePeer(false);
    return await this.driver.host(opts);
  }

  async join(code, meta = {}) {
    const raw = String(code || '').trim().toUpperCase();
    if (meta.mode === 'lan' || meta.isInternal || isLikelyLanCode(raw)) {
      this.usePeer(true);
      return await this.gdf.join(raw, meta);
    }

    // Se houver sala local com esse mesmo codigo na sub-rede, conecta instantaneamente
    if (this.lan) {
      const localRooms = await this.lan.discover(320);
      if (localRooms.some((r) => r.code.toUpperCase() === raw)) {
        this.usePeer(true);
        return await this.gdf.join(raw, meta);
      }
    }

    this.usePeer(false);
    try {
      return await this.driver.join(raw, meta);
    } catch (err) {
      if (this.driver !== this.gdf) {
        this.usePeer(true);
        return await this.gdf.join(raw, meta);
      }
      throw err;
    }
  }

  async quickJoin(meta = {}, onStatus = null) {
    if (this.lan) {
      const localRooms = await this.lan.discover(400);
      if (localRooms.some((r) => !r.full)) {
        this.usePeer(true);
        return await this.gdf.quickJoin(meta, onStatus);
      }
    }
    if (meta.mode === 'lan' || meta.isInternal || !this.swarm) {
      this.usePeer(true);
      return await this.gdf.quickJoin(meta, onStatus);
    }
    this.usePeer(false);
    return await this.driver.quickJoin(meta, onStatus);
  }

  async listLobbies(meta = {}, onStatus = null) {
    const [lanRooms, peerRooms] = await Promise.all([
      this.lan ? this.lan.discover(450) : Promise.resolve([]),
      this.peer.listLobbies(meta, onStatus).catch(() => []),
    ]);
    const byCode = new Map();
    for (const r of [...lanRooms, ...peerRooms]) {
      const k = String(r.code || '').replace(/-\d+$/, '');
      if (!k) continue;
      const prev = byCode.get(k);
      if (!prev || (r.isLan && !prev.isLan) || (r.players || 0) > (prev.players || 0)) {
        byCode.set(k, { ...r, code: k });
      }
    }
    return [...byCode.values()].sort((a, b) => (b.players || 0) - (a.players || 0));
  }

  claimAlias(code, tries) {
    if (this.driver.claimAlias) this.driver.claimAlias(code, tries);
  }

  async leave() {
    await this.gdf.leave();
    if (this.swarm) await this.swarm.leave();
  }
}

export const Net = DualNet;
