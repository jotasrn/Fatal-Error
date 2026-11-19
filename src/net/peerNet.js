import { authorizeClientPacketOnHost, authorizePacketOnClient } from '../core/security.js';
import {
  PREFIX, PUBLIC_SLOTS, GDF_PUBLIC_SLOTS, WAN_PEER_OPTS, LAN_PEER_OPTS,
  SIGNAL_TIMEOUT, makeCode, peerAvailable,
} from './constants.js';
import { PeerDiscoveryMixin } from './peerDiscovery.js';

export class PeerNet {
  constructor() {
    this.peer = null;
    this.dirPeer = null;
    this.conns = new Map();
    this.isHost = false;
    this.id = null;
    this.logicalId = null; // Permite compartilhar o mesmo hostId do LanNet no modo hibrido 
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

Object.assign(PeerNet.prototype, PeerDiscoveryMixin);
