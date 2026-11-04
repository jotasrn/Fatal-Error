// Peer-to-peer networking over WebRTC, using the public PeerJS signalling service.
// Nothing runs on a server of ours: the host player's browser is the authority, every other
// player connects straight to it. That is what lets multiplayer work from a static Vercel deploy.
//
// Lobby codes are just peer ids. A private lobby takes a random 5 letter code; a public lobby
// claims one of a handful of well-known ids (PUB0..PUB7) so quick play can find it by knocking on
// every slot at once - a directory with no directory server. A connection only counts once the
// host has answered with a welcome, so a full or closed lobby can be skipped for the next one.

// a local dev/LAN server gets its own namespace so testing and LAN play never wander into a live public lobby
const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local)$/.test(location.hostname);
const PREFIX = LOCAL ? 'doodledev-' : 'doodledistrict-';
const PUBLIC_SLOTS = 16;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
// STUN finds each peer's public address; it is enough for most home networks. When both players
// sit behind strict/symmetric NAT or carrier-grade NAT (common on mobile and some ISPs) a direct
// connection fails and the data channel never opens ("no answer from that lobby") - a TURN relay
// bounces the traffic through a public server so the connection still forms. The free Open Relay
// (metered.ca) needs no account; for heavy use, swap in your own TURN credentials.
const PEER_OPTS = { debug: 0, config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
] } };
// relaying through TURN takes a little longer to negotiate, so give the join a wider window
const JOIN_TIMEOUT = 20000, QUICK_TIMEOUT = 14000, SIGNAL_TIMEOUT = 14000;

function peerAvailable() { return typeof window !== 'undefined' && typeof window.Peer === 'function'; }
const idFromError = (err) => { const m = /peer\s+(\S+)/.exec(String(err && err.message || '')); return m ? m[1] : null; };

class PeerNet {
  constructor() {
    this.peer = null; this.conns = new Map(); this.isHost = false; this.id = null; this.code = null; this.hostId = null;
    this.handlers = new Map(); this.connected = false; this.onPeerJoin = null; this.onPeerLeave = null; this.onDisconnect = null;
    this.maxPlayers = 10; this.accepting = true; this.hostName = ''; this.stats = { sent: 0, recv: 0 }; this.isPublic = false;
  }
  get active() { return !!this.peer && this.connected; }
  get peerIds() { return [...this.conns.keys()]; }
  on(type, fn) { this.handlers.set(type, fn); }
  _emit(type, data, from) { const h = this.handlers.get(type); if (h) h(data, from); }

  _newPeer(id) {
    return new Promise((resolve, reject) => {
      if (!peerAvailable()) return reject(new Error('networking library did not load'));
      const peer = new window.Peer(id, PEER_OPTS); let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; peer.destroy(); reject(new Error('signalling server timed out')); } }, SIGNAL_TIMEOUT);
      peer.on('open', () => { if (settled) return; settled = true; clearTimeout(timer); resolve(peer); });
      peer.on('error', (err) => { if (settled) return; settled = true; clearTimeout(timer); peer.destroy(); reject(err); });
    });
  }
  _wire(conn) {
    conn.on('data', (msg) => { this.stats.recv++; if (!msg || typeof msg !== 'object') return; this._route(msg, conn.peer); });
    conn.on('close', () => this._drop(conn.peer));
    conn.on('error', () => this._drop(conn.peer));
  }
  _drop(pid) {
    if (this.leaving || !this.conns.has(pid)) return; this.conns.delete(pid);
    if (this.isHost) { if (this.onPeerLeave) this.onPeerLeave(pid); this.broadcast('leave', { id: pid }); }
    else if (pid === this.hostId) { this.connected = false; if (this.onDisconnect) this.onDisconnect(); }
  }
  _route(msg, from) {
    // clients can address each other; the host forwards those
    if (this.isHost && msg.to && msg.to !== this.id) { const c = this.conns.get(msg.to); if (c && c.open) c.send(msg); return; }
    if (this.isHost && msg.relay) { for (const [pid, c] of this.conns) if (pid !== from && c.open) c.send({ t: msg.t, d: msg.d, from }); }
    this._emit(msg.t, msg.d, msg.from || from);
  }
  _keepAlive(peer) { peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } }); }

  // ---- lobby creation / joining ----
  async host({ isPublic = false, code = null } = {}) {
    this.leave(); this.isHost = true; this.isPublic = isPublic;
    if (code) { this.code = String(code).toUpperCase(); this.peer = await this._newPeer(PREFIX + this.code); }
    else if (isPublic) {
      for (let slot = 0; slot < PUBLIC_SLOTS; slot++) {
        try { this.peer = await this._newPeer(PREFIX + 'PUB' + slot); this.code = 'PUB' + slot; break; } catch (e) { if (!(e && e.type === 'unavailable-id')) throw e; }
      }
      if (!this.peer) throw new Error('all public lobbies are busy - host a private one');
    } else {
      for (let tries = 0; tries < 3 && !this.peer; tries++) {
        this.code = makeCode();
        try { this.peer = await this._newPeer(PREFIX + this.code); } catch (e) { if (!(e && e.type === 'unavailable-id') || tries === 2) throw e; }
      }
    }
    this.id = this.peer.id; this.hostId = this.id; this.connected = true; this.accepting = true;
    this.peer.on('connection', (conn) => this._incoming(conn));
    this._keepAlive(this.peer);
    return this.code;
  }
  // someone knocking: a quick-play probe is told how full we are and only seated once it says it is staying
  _incoming(conn) {
    conn.on('open', () => {
      // a full lobby still says who it is, so the lobby list can show it
      if (!this.accepting || this.conns.size >= this.maxPlayers - 1) { conn.send({ t: 'refused', d: { reason: this.accepting ? 'that lobby is full' : 'that lobby is closed', code: this.aliasCode || this.code, players: this.conns.size + 1, max: this.maxPlayers, inMatch: !!this.inMatch, hostName: this.hostName } }); setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 600); return; }
      const seat = () => { if (this.conns.has(conn.peer)) return; this.conns.set(conn.peer, conn); this._wire(conn); if (this.onPeerJoin) this.onPeerJoin(conn.peer, conn.metadata || {}); };
      const welcome = { hostId: this.id, code: this.aliasCode || this.code, isPublic: this.isPublic, players: this.conns.size + 1, max: this.maxPlayers, inMatch: !!this.inMatch, hostName: this.hostName };
      if (conn.metadata && conn.metadata.probe) {
        conn.send({ t: 'welcome', d: welcome, from: this.id });
        const onData = (msg) => { if (msg && msg.t === 'stay') { conn.off('data', onData); seat(); } };
        conn.on('data', onData);
      } else { conn.send({ t: 'welcome', d: welcome, from: this.id }); seat(); }
    });
  }
  // after a host transfer the lobby lives on a generation code; keep trying to open the original code
  // as a second front door so it stays the code people know
  claimAlias(code, tries = 20) {
    if (!this.isHost || this.alias || this._aliasTimer) return;
    const attempt = async () => {
      this._aliasTimer = null; if (!this.isHost || this.alias) return;
      try { const peer = await this._newPeer(PREFIX + code); if (!this.isHost) { peer.destroy(); return; } this.alias = peer; this.aliasCode = code; peer.on('connection', (conn) => this._incoming(conn)); if (this.onAlias) this.onAlias(code); }
      catch (e) { if (--tries > 0) this._aliasTimer = setTimeout(attempt, 6000); }
    };
    this._aliasTimer = setTimeout(attempt, 1500);
  }
  async join(code, meta = {}, wantId = null) {
    this.leave(); this.isHost = false; code = String(code || '').trim().toUpperCase();
    if (!code) throw new Error('enter a lobby code');
    this.peer = await this._newPeer(null);
    this.id = this.peer.id; this._keepAlive(this.peer);
    // a lobby that changed hosts lives on a generation code; the plain code still finds it
    const base = code.replace(/-\d+$/, ''); const ids = [code, ...['-1', '-2', '-3'].map((suf) => base + suf).filter((c) => c !== code)].map((c) => PREFIX + c);
    let res; try { res = await this._knockAny(ids, meta, JOIN_TIMEOUT); } catch (e) { this.leave(); throw e; }
    const { hostId, conn, welcome } = res; this._adopt(hostId, conn, welcome); this.code = (welcome && welcome.code) || hostId.slice(PREFIX.length); return this.code;
  }
  // try every public slot at the same time and take the first host that says welcome
  async quickJoin(meta = {}, onStatus = null) {
    this.leave(); this.isHost = false; this.peer = await this._newPeer(null); this.id = this.peer.id; this._keepAlive(this.peer);
    if (onStatus) onStatus('Procurando salas abertas…');
    const ids = []; for (let i = 0; i < PUBLIC_SLOTS; i++) for (const suf of ['', '-1', '-2', '-3']) ids.push(PREFIX + 'PUB' + i + suf);
    const winner = await new Promise((resolve) => {
      let pending = ids.length, done = false; const attempts = [], offers = []; let gather = null;
      const pick = () => { if (!offers.length) return null; offers.sort((a, b) => (b.welcome.players || 0) - (a.welcome.players || 0)); return offers[0]; };
      const settle = () => { if (done) return; done = true; clearTimeout(timer); clearTimeout(gather); this.peer.off('error', onErr); const val = pick(); for (const a of attempts) if (!val || a.conn !== val.conn) { try { a.conn.close(); } catch (e) { /* ignore */ } } resolve(val); };
      const failOne = (a) => { if (a.done) return; a.done = true; pending--; if (pending <= 0) settle(); };
      const onErr = (err) => { if (err && err.type === 'peer-unavailable') { const a = attempts.find((x) => x.hostId === idFromError(err)); if (a) failOne(a); } };
      this.peer.on('error', onErr);
      const timer = setTimeout(settle, QUICK_TIMEOUT);
      const probeMeta = { ...meta, probe: true };
      for (const hostId of ids) {
        let conn; try { conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: probeMeta }); } catch (e) { pending--; continue; }
        const a = { conn, hostId, done: false }; attempts.push(a);
        conn.on('data', (msg) => { if (!msg || a.done) return; if (msg.t === 'welcome') { a.done = true; pending--; offers.push({ conn, hostId, welcome: msg.d }); if (onStatus) onStatus(`Encontradas ${offers.length} salas abertas…`); if (pending <= 0) settle(); else if (!gather) gather = setTimeout(settle, 1500); } else if (msg.t === 'refused') failOne(a); });
        conn.on('error', () => failOne(a)); conn.on('close', () => failOne(a));
      }
      if (pending <= 0) settle();
    });
    if (!winner) { this.leave(); throw new Error('no open public lobbies'); }
    winner.conn.send({ t: 'stay' });
    this._adopt(winner.hostId, winner.conn, winner.welcome); this.code = (winner.welcome && winner.welcome.code) || winner.hostId.slice(PREFIX.length); return this.code;
  }
  // knock on several ids at once; the first welcome wins, a refusal or a missing lobby on every one fails
  // a look at every public lobby: who is hosting, how full, whether a match is on. Nothing is joined.
  async listLobbies(meta = {}, onStatus = null) {
    if (this.active) throw new Error('leave the lobby first');
    const peer = await this._newPeer(null);
    const ids = []; for (let i = 0; i < PUBLIC_SLOTS; i++) for (const suf of ['', '-1', '-2', '-3']) ids.push(PREFIX + 'PUB' + i + suf);
    const found = await new Promise((resolve) => {
      let pending = ids.length, done = false; const attempts = [], offers = []; let gather = null;
      const settle = () => { if (done) return; done = true; clearTimeout(timer); clearTimeout(gather); peer.off('error', onErr); for (const a of attempts) { try { a.conn.close(); } catch (e) { /* ignore */ } } resolve(offers); };
      const failOne = (a) => { if (a.done) return; a.done = true; pending--; if (pending <= 0) settle(); };
      const onErr = (err) => { if (err && err.type === 'peer-unavailable') { const a = attempts.find((x) => x.hostId === idFromError(err)); if (a) failOne(a); } };
      peer.on('error', onErr);
      const timer = setTimeout(settle, QUICK_TIMEOUT);
      const probeMeta = { ...meta, probe: true };
      for (const hostId of ids) {
        let conn; try { conn = peer.connect(hostId, { reliable: true, serialization: 'json', metadata: probeMeta }); } catch (e) { pending--; continue; }
        const a = { conn, hostId, done: false }; attempts.push(a);
        conn.on('data', (msg) => { if (!msg || a.done) return; if (msg.t === 'welcome' || msg.t === 'refused') { a.done = true; pending--; const d = msg.d || {}; offers.push({ id: hostId.slice(PREFIX.length), code: d.code || hostId.slice(PREFIX.length), players: d.players || 0, max: d.max || 10, inMatch: !!d.inMatch, hostName: d.hostName || '', full: msg.t === 'refused' }); if (onStatus) onStatus(`Encontradas ${offers.length} salas…`); if (pending <= 0) settle(); else if (!gather) gather = setTimeout(settle, 2200); } });
        conn.on('error', () => failOne(a)); conn.on('close', () => failOne(a));
      }
      if (pending <= 0) settle();
    });
    try { peer.destroy(); } catch (e) { /* ignore */ }
    // one lobby can answer on more than one id after a host change; keep the fuller answer per code
    const byCode = new Map(); for (const o of found) { const k = o.code.replace(/-\d+$/, ''); const prev = byCode.get(k); if (!prev || o.players > prev.players) byCode.set(k, { ...o, code: k }); }
    return [...byCode.values()].sort((a, b) => b.players - a.players);
  }
  _knockAny(ids, meta, timeoutMs) {
    return new Promise((resolve, reject) => {
      let pending = ids.length, done = false, lastErr = null; const attempts = [];
      const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); this.peer.off('error', onErr); for (const a of attempts) if (!val || a.conn !== val.conn) { try { a.conn.close(); } catch (e) { /* ignore */ } } if (val) resolve(val); else reject(err || new Error('no lobby with that code')); };
      const failOne = (a, err) => { if (a.done) return; a.done = true; if (err && !/no lobby/.test(String(err.message))) lastErr = err; pending--; if (pending <= 0) finish(lastErr || new Error('no lobby with that code')); };
      const onErr = (err) => { if (err && err.type === 'peer-unavailable') { const a = attempts.find((x) => x.hostId === idFromError(err)); if (a) failOne(a, new Error('no lobby with that code')); } };
      this.peer.on('error', onErr);
      const timer = setTimeout(() => finish(new Error('no answer from that lobby')), timeoutMs);
      for (const hostId of ids) {
        let conn; try { conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: meta }); } catch (e) { pending--; continue; }
        const a = { conn, hostId, done: false }; attempts.push(a);
        conn.on('data', (msg) => { if (!msg || a.done) return; if (msg.t === 'welcome') { a.done = true; finish(null, { hostId, conn, welcome: msg.d }); } else if (msg.t === 'refused') failOne(a, new Error(msg.d && msg.d.reason || 'the lobby turned you away')); });
        conn.on('error', (e) => failOne(a, e instanceof Error ? e : new Error('could not connect'))); conn.on('close', () => failOne(a, null));
      }
      if (pending <= 0) finish(lastErr || new Error('no lobby with that code'));
    });
  }
  _knock(hostId, meta, timeoutMs) {
    return new Promise((resolve, reject) => {
      let conn; try { conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: meta }); } catch (e) { return reject(new Error('could not start a connection')); }
      let done = false;
      const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); this.peer.off('error', onErr); if (err) { try { conn.close(); } catch (e) { /* ignore */ } reject(err); } else resolve(val); };
      const timer = setTimeout(() => finish(new Error('no answer from that lobby')), timeoutMs);
      const onErr = (err) => { if (err && err.type === 'peer-unavailable' && idFromError(err) === hostId) finish(new Error('no lobby with that code')); };
      this.peer.on('error', onErr);
      conn.on('data', (msg) => { if (!msg) return; if (msg.t === 'welcome') finish(null, { conn, welcome: msg.d }); else if (msg.t === 'refused') finish(new Error(msg.d && msg.d.reason || 'the lobby turned you away')); });
      conn.on('error', (e) => finish(e instanceof Error ? e : new Error('could not connect')));
      conn.on('close', () => finish(new Error('the lobby closed the connection')));
    });
  }
  _adopt(hostId, conn, welcome) {
    this.hostId = hostId; this.conns.set(hostId, conn); this.connected = true; this.isPublic = !!(welcome && welcome.isPublic); this._wire(conn);
  }
  leave() {
    // closing our own connections must not look like other people leaving
    this.leaving = true; clearTimeout(this._aliasTimer); this._aliasTimer = null; if (this.alias) { try { this.alias.destroy(); } catch (e) { /* ignore */ } } this.alias = null; this.aliasCode = null;
    for (const c of this.conns.values()) { try { c.close(); } catch (e) { /* ignore */ } }
    this.conns.clear(); if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = null; this.connected = false; this.isHost = false; this.id = null; this.code = null; this.hostId = null; this.leaving = false;
  }

  // ---- messaging ----
  // host: to everyone; client: to the host (and on to everyone if relay is set)
  send(type, data, relay = false) {
    this.stats.sent++;
    if (this.isHost) { const m = { t: type, d: data, from: this.id }; for (const c of this.conns.values()) if (c.open) c.send(m); }
    else { const c = this.conns.get(this.hostId); if (c && c.open) c.send({ t: type, d: data, relay }); }
  }
  broadcast(type, data) { this.send(type, data, true); }
  sendTo(pid, type, data) {
    this.stats.sent++;
    if (this.isHost) { const c = this.conns.get(pid); if (c && c.open) c.send({ t: type, d: data, from: this.id }); }
    else { const c = this.conns.get(this.hostId); if (c && c.open) c.send({ t: type, d: data, to: pid, from: this.id }); }
  }
}

// ---- Hyperswarm transport (Electron build) ----
// Same public API as PeerNet, but the connection is a real DHT-discovered P2P link with
// hole-punching (via electron/main.cjs over window.FE_NET), so it crosses NAT without any broker
// or TURN relay. The lobby code becomes a DHT topic; the host announces it, clients look it up.
// Peer ids are the swarm public keys, which both sides agree on, so scores/lobby keys line up.
const SWARM_JOIN_TIMEOUT = 20000;
class SwarmNet {
  constructor() {
    this.bridge = window.FE_NET;
    this.conns = new Map();      // key -> { open, send, close }
    this.isHost = false; this.id = null; this.code = null; this.hostId = null;
    this.handlers = new Map(); this.connected = false; this.onPeerJoin = null; this.onPeerLeave = null; this.onDisconnect = null; this.onAlias = null;
    this.maxPlayers = 10; this.accepting = true; this.hostName = ''; this.stats = { sent: 0, recv: 0 }; this.isPublic = false; this.aliasCode = null; this.inMatch = false;
    this._pendingJoin = null; this._joinMeta = null;
    this.bridge.onConnect((key) => this._onConnect(key));
    this.bridge.onData((key, msg) => this._onData(key, msg));
    this.bridge.onDisconnect((key) => this._onDisconnect(key));
  }
  get active() { return this.connected; }
  get peerIds() { return [...this.conns.keys()]; }
  on(type, fn) { this.handlers.set(type, fn); }
  _emit(type, data, from) { const h = this.handlers.get(type); if (h) h(data, from); }
  _wrap(key) { return { open: true, send: (m) => { this.stats.sent++; this.bridge.send(key, m); }, close: () => { /* per-peer close handled by leave() */ } }; }
  _onConnect(key) {
    // client: greet the host as soon as the link is up; the host replies with a welcome
    if (!this.isHost) this.bridge.send(key, { t: 'hello', d: this._joinMeta || {}, from: this.id });
  }
  _onData(key, msg) {
    this.stats.recv++; if (!msg || typeof msg !== 'object') return;
    if (this.isHost) {
      if (msg.t === 'hello') {
        if (!this.accepting || this.conns.size >= this.maxPlayers - 1) {
          this.bridge.send(key, { t: 'refused', d: { reason: this.accepting ? 'that lobby is full' : 'that lobby is closed', code: this.code, players: this.conns.size + 1, max: this.maxPlayers, inMatch: !!this.inMatch, hostName: this.hostName } });
          return;
        }
        const isNew = !this.conns.has(key);
        if (isNew) this.conns.set(key, this._wrap(key));
        // Send welcome BEFORE onPeerJoin (which broadcasts the lobby). The client sets its hostId
        // from the welcome, and until it does it drops every other host message — so if the lobby
        // arrived first the client would never register the host and would see an invisible player.
        this.bridge.send(key, { t: 'welcome', d: { hostId: this.id, code: this.code, isPublic: this.isPublic, players: this.conns.size + 1, max: this.maxPlayers, inMatch: !!this.inMatch, hostName: this.hostName }, from: this.id });
        if (isNew && this.onPeerJoin) this.onPeerJoin(key, msg.d || {});
        return;
      }
      // host routing: forward addressed messages, fan out relays, then deliver locally
      if (msg.to && msg.to !== this.id) { const w = this.conns.get(msg.to); if (w) w.send(msg); return; }
      if (msg.relay) { for (const [pid, w] of this.conns) if (pid !== key) w.send({ t: msg.t, d: msg.d, from: key }); }
      this._emit(msg.t, msg.d, msg.from || key);
    } else {
      if (msg.t === 'welcome') {
        this.hostId = key; this.conns.set(key, this._wrap(key)); this.connected = true; this.isPublic = !!(msg.d && msg.d.isPublic); this.code = (msg.d && msg.d.code) || this.code;
        if (this._pendingJoin) { clearTimeout(this._pendingJoin.timer); this._pendingJoin.resolve(this.code); this._pendingJoin = null; }
        return;
      }
      if (msg.t === 'refused') { if (this._pendingJoin) { clearTimeout(this._pendingJoin.timer); this._pendingJoin.reject(new Error(msg.d && msg.d.reason || 'the lobby turned you away')); this._pendingJoin = null; } return; }
      if (key !== this.hostId) return;   // only the host speaks to a client
      this._emit(msg.t, msg.d, msg.from || key);
    }
  }
  _onDisconnect(key) {
    const had = this.conns.has(key); this.conns.delete(key);
    if (this.isHost) { if (had) { if (this.onPeerLeave) this.onPeerLeave(key); this.broadcast('leave', { id: key }); } }
    else if (key === this.hostId) { this.connected = false; if (this.onDisconnect) this.onDisconnect(); }
  }
  async host({ isPublic = false, code = null } = {}) {
    await this.leave(); this.isHost = true; this.isPublic = isPublic;
    this.code = code ? String(code).toUpperCase() : (isPublic ? 'PUBLIC' : makeCode());
    this.id = await this.bridge.host(this.code); this.hostId = this.id; this.connected = true; this.accepting = true;
    return this.code;
  }
  async join(code, meta = {}) {
    await this.leave(); this.isHost = false; code = String(code || '').trim().toUpperCase();
    if (!code) throw new Error('enter a lobby code');
    this.code = code; this._joinMeta = { ...meta };
    this.id = await this.bridge.join(code);
    for (const key of this.conns.keys()) this.bridge.send(key, { t: 'hello', d: this._joinMeta, from: this.id });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this._pendingJoin = null; this.leave(); reject(new Error('no answer from that lobby')); }, SWARM_JOIN_TIMEOUT);
      this._pendingJoin = { resolve, reject, timer };
    });
  }
  async quickJoin(meta = {}, onStatus = null) {
    if (onStatus) onStatus('Procurando sala pública…');
    try { return await this.join('PUBLIC', meta); }
    catch (e) { if (onStatus) onStatus('Nenhuma sala aberta · criando uma nova…'); return await this.host({ isPublic: true, code: 'PUBLIC' }); }
  }
  async listLobbies() { return []; }   // a serverless DHT has no lobby directory
  claimAlias() { /* host-migration alias is not used in the swarm build */ }
  async leave() {
    if (this._pendingJoin) { clearTimeout(this._pendingJoin.timer); this._pendingJoin = null; }
    this.conns.clear(); this.connected = false; this.isHost = false; this.id = null; this.code = null; this.hostId = null;
    try { await this.bridge.leave(); } catch (e) { /* ignore */ }
  }
  send(type, data, relay = false) {
    this.stats.sent++;
    if (this.isHost) { const m = { t: type, d: data, from: this.id }; for (const w of this.conns.values()) w.send(m); }
    else { const w = this.conns.get(this.hostId); if (w) w.send({ t: type, d: data, relay }); }
  }
  broadcast(type, data) { this.send(type, data, true); }
  sendTo(pid, type, data) {
    this.stats.sent++;
    if (this.isHost) { const w = this.conns.get(pid); if (w) w.send({ t: type, d: data, from: this.id }); }
    else { const w = this.conns.get(this.hostId); if (w) w.send({ t: type, d: data, to: pid, from: this.id }); }
  }
}

// In the Electron build the renderer sees window.FE_NET (the Hyperswarm bridge) and uses the
// serverless DHT transport; a plain browser falls back to PeerJS so the web/dev version still runs.

// ---- DualNet: Support both Global P2P (Hyperswarm) and Corporate/GDFNet (WebRTC/PeerNet) ----
export class DualNet {
  constructor() {
    this.swarm = (typeof window !== 'undefined' && window.FE_NET) ? new SwarmNet() : null;
    this.peer = new PeerNet();
    this.driver = this.swarm || this.peer;
    this.mode = this.swarm ? 'swarm' : 'peer';
    this.isInternal = false;
  }
  usePeer(isLan = true) {
    this.isInternal = isLan;
    this.driver = (isLan || !this.swarm) ? this.peer : this.swarm;
    this.mode = (isLan || !this.swarm) ? 'peer' : 'swarm';
    return this.driver;
  }
  get active() { return this.driver.active; }
  get conns() { return this.driver.conns; }
  get peerIds() { return this.driver.peerIds; }
  get id() { return this.driver.id; }
  get code() { return this.driver.code; }
  get hostId() { return this.driver.hostId; }
  get isHost() { return this.driver.isHost; }
  get isPublic() { return this.driver.isPublic; }
  set isPublic(v) { this.driver.isPublic = v; }
  get inMatch() { return this.driver.inMatch; }
  set inMatch(v) { this.driver.inMatch = v; }
  get accepting() { return this.driver.accepting; }
  set accepting(v) { this.driver.accepting = v; }
  get maxPlayers() { return this.driver.maxPlayers; }
  set maxPlayers(v) { this.driver.maxPlayers = v; }
  get hostName() { return this.driver.hostName; }
  set hostName(v) { this.driver.hostName = v; }
  get aliasCode() { return this.driver.aliasCode; }

  set onPeerJoin(fn) { this.peer.onPeerJoin = fn; if (this.swarm) this.swarm.onPeerJoin = fn; }
  set onPeerLeave(fn) { this.peer.onPeerLeave = fn; if (this.swarm) this.swarm.onPeerLeave = fn; }
  set onDisconnect(fn) { this.peer.onDisconnect = fn; if (this.swarm) this.swarm.onDisconnect = fn; }
  set onAlias(fn) { this.peer.onAlias = fn; if (this.swarm) this.swarm.onAlias = fn; }

  on(type, fn) {
    this.peer.on(type, fn);
    if (this.swarm) this.swarm.on(type, fn);
  }
  send(type, data, relay = false) { return this.driver.send(type, data, relay); }
  broadcast(type, data) { return this.driver.broadcast(type, data); }
  sendTo(pid, type, data) { return this.driver.sendTo(pid, type, data); }

  async host(opts = {}) {
    if (opts.mode === 'lan' || opts.isInternal) {
      this.usePeer(true);
    } else {
      this.usePeer(false);
    }
    return await this.driver.host(opts);
  }

  async join(code, meta = {}) {
    const raw = String(code || '').trim().toUpperCase();
    if (meta.mode === 'lan' || meta.isInternal || raw.startsWith('GDF') || raw.startsWith('LAN')) {
      this.usePeer(true);
      return await this.driver.join(raw.replace(/^(GDF|LAN)-?/, ''), meta);
    }
    try {
      return await this.driver.join(raw, meta);
    } catch (err) {
      if (this.driver !== this.peer) {
        console.warn('Hyperswarm indisponível (GDFNet/UDP bloqueado), tentando via WebRTC...');
        this.usePeer(true);
        return await this.driver.join(raw, meta);
      }
      throw err;
    }
  }

  async quickJoin(meta = {}, onStatus = null) {
    return await this.driver.quickJoin(meta, onStatus);
  }
  async listLobbies(meta = {}, onStatus = null) {
    return await this.peer.listLobbies(meta, onStatus);
  }
  claimAlias(code, tries) {
    if (this.driver.claimAlias) this.driver.claimAlias(code, tries);
  }
  async leave() {
    await this.peer.leave();
    if (this.swarm) await this.swarm.leave();
  }
}

export const Net = DualNet;

