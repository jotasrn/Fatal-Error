import { authorizeClientPacketOnHost, authorizePacketOnClient } from '../core/security.js';
import { makeCode } from './constants.js';

export class BridgeNet {
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

export class SwarmNet extends BridgeNet {
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

export class LanNet extends BridgeNet {
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
